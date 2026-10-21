//! Kura Local Vault & LMS Task Store (HTTP Port 8089)
//! Menggantikan `dynamic-island/main/kura-server.js` 100% native Rust tanpa ketergantungan Node.js!

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LmsTask {
    pub id: String,
    pub title: String,
    #[serde(default, rename = "courseId")]
    pub course_id: String,
    #[serde(default, rename = "courseName")]
    pub course_name: String,
    #[serde(default, rename = "type")]
    pub task_type: String,
    #[serde(default)]
    pub href: String,
    #[serde(default, rename = "dueTimestamp")]
    pub due_timestamp: Option<i64>,
    #[serde(default, rename = "isDone")]
    pub is_done: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct TasksPayload {
    #[serde(rename = "lastUpdated")]
    pub last_updated: Option<String>,
    #[serde(rename = "totalCourses")]
    pub total_courses: usize,
    pub tasks: Vec<LmsTask>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KuraConfig {
    #[serde(default, rename = "lmsCalendarIcsUrl")]
    pub lms_calendar_ics_url: String,
    #[serde(default, rename = "lmsCookie")]
    pub lms_cookie: String,
    #[serde(default, rename = "urgentThresholdHours")]
    pub urgent_threshold_hours: u32,
}

impl Default for KuraConfig {
    fn default() -> Self {
        Self {
            lms_calendar_ics_url: String::new(),
            lms_cookie: String::new(),
            urgent_threshold_hours: 24,
        }
    }
}

pub struct VaultService {
    data_dir: PathBuf,
    tasks_file: PathBuf,
    config_file: PathBuf,
    tasks: Arc<Mutex<TasksPayload>>,
    config: Arc<Mutex<KuraConfig>>,
    sse_clients: Arc<Mutex<Vec<TcpStream>>>,
}

impl VaultService {
    pub fn new() -> Self {
        let mut data_dir = paths::user_data_dir().join("data");
        // Fallback jika ada dynamic-island/data
        if let Some(dev_data) = paths::resolve(&["data"]) {
            data_dir = dev_data;
        }

        let _ = fs::create_dir_all(&data_dir);
        let tasks_file = data_dir.join("tasks.json");
        let config_file = data_dir.join("config.json");

        let loaded_tasks = Self::load_tasks_file(&tasks_file);
        let loaded_config = Self::load_config_file(&config_file);

        let service = Self {
            data_dir,
            tasks_file,
            config_file,
            tasks: Arc::new(Mutex::new(loaded_tasks)),
            config: Arc::new(Mutex::new(loaded_config)),
            sse_clients: Arc::new(Mutex::new(Vec::new())),
        };

        service.start_http_server(8089);
        service
    }

    fn load_tasks_file(path: &PathBuf) -> TasksPayload {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(payload) = serde_json::from_str::<TasksPayload>(&content) {
                return payload;
            }
        }
        TasksPayload::default()
    }

    fn load_config_file(path: &PathBuf) -> KuraConfig {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(cfg) = serde_json::from_str::<KuraConfig>(&content) {
                return cfg;
            }
        }
        KuraConfig::default()
    }

    pub fn get_tasks(&self) -> TasksPayload {
        self.tasks.lock().unwrap().clone()
    }

    pub fn toggle_task(&self, task_id: &str) -> TasksPayload {
        let mut store = self.tasks.lock().unwrap();
        for t in &mut store.tasks {
            if t.id == task_id {
                t.is_done = !t.is_done;
                break;
            }
        }
        let updated = store.clone();
        drop(store);

        self.save_and_broadcast(&updated);
        updated
    }

    fn save_and_broadcast(&self, payload: &TasksPayload) {
        if let Ok(json_str) = serde_json::to_string_pretty(payload) {
            let _ = fs::write(&self.tasks_file, json_str);
        }

        // Broadcast ke semua SSE clients
        if let Ok(json_str) = serde_json::to_string(payload) {
            let sse_msg = format!("data: {}\n\n", json_str);
            let mut clients = self.sse_clients.lock().unwrap();
            clients.retain_mut(|client| {
                client.write_all(sse_msg.as_bytes()).is_ok()
            });
        }
    }

    fn start_http_server(&self, port: u16) {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)) {
            Ok(l) => l,
            Err(_) => return, // Port mungkin sudah dipakai atau tidak diizinkan
        };

        let tasks_arc = self.tasks.clone();
        let config_arc = self.config.clone();
        let sse_clients_arc = self.sse_clients.clone();
        let tasks_file = self.tasks_file.clone();
        let config_file = self.config_file.clone();

        thread::spawn(move || {
            for stream in listener.incoming() {
                if let Ok(stream) = stream {
                    let tasks = tasks_arc.clone();
                    let config = config_arc.clone();
                    let sse = sse_clients_arc.clone();
                    let t_file = tasks_file.clone();
                    let c_file = config_file.clone();

                    thread::spawn(move || {
                        handle_http_connection(stream, tasks, config, sse, t_file, c_file);
                    });
                }
            }
        });
    }
}

fn handle_http_connection(
    mut stream: TcpStream,
    tasks_arc: Arc<Mutex<TasksPayload>>,
    config_arc: Arc<Mutex<KuraConfig>>,
    sse_clients: Arc<Mutex<Vec<TcpStream>>>,
    tasks_file: PathBuf,
    config_file: PathBuf,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let req_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = req_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let full_path = parts[1];
    let path = full_path.split('?').next().unwrap_or("");

    let cors_headers = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n";

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes());
        return;
    }

    if method == "GET" && path == "/__qbot__/config" {
        let cfg = config_arc.lock().unwrap().clone();
        let body = serde_json::to_string(&cfg).unwrap_or_else(|_| "{}".into());
        let resp = format!("{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", cors_headers, body.len(), body);
        let _ = stream.write_all(resp.as_bytes());
        return;
    }

    if method == "GET" && path == "/__qbot__/tasks" {
        let payload = tasks_arc.lock().unwrap().clone();
        let body = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into());
        let resp = format!("{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", cors_headers, body.len(), body);
        let _ = stream.write_all(resp.as_bytes());
        return;
    }

    if method == "GET" && path == "/__qbot__/tasks/stream" {
        let _ = stream.set_read_timeout(None);
        let _ = stream.set_write_timeout(None);

        let sse_init = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n";
        if stream.write_all(sse_init.as_bytes()).is_err() {
            return;
        }

        let payload = tasks_arc.lock().unwrap().clone();
        if let Ok(json_str) = serde_json::to_string(&payload) {
            let init_msg = format!("data: {}\n\n", json_str);
            let _ = stream.write_all(init_msg.as_bytes());
        }

        let mut clients = sse_clients.lock().unwrap();
        clients.push(stream);
        return;
    }

    if method == "POST" {
        let body_str = if let Some(idx) = req_str.find("\r\n\r\n") {
            &req_str[idx + 4..]
        } else {
            ""
        };

        if path == "/__qbot__/config" {
            if let Ok(new_cfg) = serde_json::from_str::<KuraConfig>(body_str) {
                *config_arc.lock().unwrap() = new_cfg.clone();
                if let Ok(json_str) = serde_json::to_string_pretty(&new_cfg) {
                    let _ = fs::write(&config_file, json_str);
                }
                let body = serde_json::to_string(&new_cfg).unwrap_or_default();
                let resp = format!("{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", cors_headers, body.len(), body);
                let _ = stream.write_all(resp.as_bytes());
                return;
            }
        }

        if path == "/__qbot__/tasks/toggle" {
            #[derive(Deserialize)]
            struct ToggleReq {
                id: String,
            }

            if let Ok(req) = serde_json::from_str::<ToggleReq>(body_str) {
                let mut store = tasks_arc.lock().unwrap();
                for t in &mut store.tasks {
                    if t.id == req.id {
                        t.is_done = !t.is_done;
                        break;
                    }
                }
                let updated = store.clone();
                drop(store);

                if let Ok(json_str) = serde_json::to_string_pretty(&updated) {
                    let _ = fs::write(&tasks_file, json_str);
                }

                if let Ok(json_str) = serde_json::to_string(&updated) {
                    let sse_msg = format!("data: {}\n\n", json_str);
                    let mut clients = sse_clients.lock().unwrap();
                    clients.retain_mut(|c| c.write_all(sse_msg.as_bytes()).is_ok());

                    let resp = format!("{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", cors_headers, json_str.len(), json_str);
                    let _ = stream.write_all(resp.as_bytes());
                    return;
                }
            }
        }

        if path == "/__qbot__/tasks" {
            #[derive(Deserialize)]
            struct IncomingTasks {
                #[serde(default)]
                tasks: Vec<LmsTask>,
                #[serde(default, rename = "totalCourses")]
                total_courses: usize,
            }

            if let Ok(req) = serde_json::from_str::<IncomingTasks>(body_str) {
                let mut store = tasks_arc.lock().unwrap();
                let mut map = std::collections::HashMap::new();
                for t in &store.tasks {
                    map.insert(t.id.clone(), t.clone());
                }
                for in_t in req.tasks {
                    map.insert(in_t.id.clone(), in_t);
                }
                store.tasks = map.into_values().collect();
                store.total_courses = req.total_courses.max(store.total_courses);
                store.last_updated = Some(format!("{:?}", std::time::SystemTime::now()));
                let updated = store.clone();
                drop(store);

                if let Ok(json_str) = serde_json::to_string_pretty(&updated) {
                    let _ = fs::write(&tasks_file, json_str);
                }

                if let Ok(json_str) = serde_json::to_string(&updated) {
                    let sse_msg = format!("data: {}\n\n", json_str);
                    let mut clients = sse_clients.lock().unwrap();
                    clients.retain_mut(|c| c.write_all(sse_msg.as_bytes()).is_ok());

                    let resp = format!("{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", cors_headers, json_str.len(), json_str);
                    let _ = stream.write_all(resp.as_bytes());
                    return;
                }
            }
        }
    }

    let not_found = "HTTP/1.1 404 Not Found\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 2\r\n\r\n{}";
    let _ = stream.write_all(not_found.as_bytes());
}
