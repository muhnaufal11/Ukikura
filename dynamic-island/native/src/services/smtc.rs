//! Integrasi SMTC (System Media Transport Controls) Windows Asli (Windows.Media.Control).

use std::time::{Instant, SystemTime, UNIX_EPOCH};
use windows::core::Result;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[derive(Clone, Debug, PartialEq)]
pub struct MediaState {
    pub active: bool,
    pub title: String,
    pub artist: String,
    pub status: String,
    pub position_sec: f64,
    pub duration_sec: f64,
    pub app_id: String,
    pub last_updated_ms: u128,
}

impl Default for MediaState {
    fn default() -> Self {
        Self {
            active: false,
            title: String::new(),
            artist: String::new(),
            status: "Closed".to_string(),
            position_sec: 0.0,
            duration_sec: 0.0,
            app_id: String::new(),
            last_updated_ms: 0,
        }
    }
}

pub struct SmtcService {
    manager: Option<GlobalSystemMediaTransportControlsSessionManager>,
    last_query: Instant,
    cached_state: MediaState,
}

impl SmtcService {
    pub fn new() -> Self {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .ok()
            .and_then(|op| op.join().ok());
        Self {
            manager,
            last_query: Instant::now(),
            cached_state: MediaState::default(),
        }
    }

    fn current_session(&self) -> Option<GlobalSystemMediaTransportControlsSession> {
        self.manager.as_ref().and_then(|m| m.GetCurrentSession().ok())
    }

    pub fn poll_state(&mut self) -> MediaState {
        // Jika kueri terakhir < 400ms, gunakan cache + interpolasi waktu untuk menghindari lag COM
        let elapsed = self.last_query.elapsed();
        if elapsed.as_millis() < 400 && !self.cached_state.title.is_empty() {
            let mut interp = self.cached_state.clone();
            if interp.status == "Playing" {
                interp.position_sec = (interp.position_sec + elapsed.as_secs_f64()).min(interp.duration_sec);
            }
            return interp;
        }

        self.last_query = Instant::now();

        if self.manager.is_none() {
            self.manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .ok()
                .and_then(|op| op.join().ok());
        }

        let Some(session) = self.current_session() else {
            self.cached_state = MediaState::default();
            return self.cached_state.clone();
        };

        let app_id = session.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
        let playback_info = session.GetPlaybackInfo().ok();
        let status = if let Some(info) = playback_info {
            match info.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) {
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => "Playing",
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "Paused",
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => "Stopped",
                _ => "Closed",
            }
        } else {
            "Closed"
        };

        let media_props = session.TryGetMediaPropertiesAsync().ok().and_then(|op| op.join().ok());
        let (title, artist) = if let Some(props) = media_props {
            let t = props.Title().map(|h| h.to_string()).unwrap_or_default();
            let a = props.Artist().map(|h| h.to_string()).unwrap_or_default();
            (t, a)
        } else {
            (String::new(), String::new())
        };

        let timeline = session.GetTimelineProperties().ok();
        let (pos, dur) = if let Some(tl) = timeline {
            let p = tl.Position().map(|ts| ts.Duration as f64 / 10_000_000.0).unwrap_or(0.0);
            let d = tl.EndTime().map(|ts| ts.Duration as f64 / 10_000_000.0).unwrap_or(0.0);
            (p, d)
        } else {
            (0.0, 0.0)
        };

        let active = !title.is_empty();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let state = MediaState {
            active,
            title,
            artist,
            status: status.to_string(),
            position_sec: pos,
            duration_sec: dur,
            app_id,
            last_updated_ms: now_ms,
        };
        self.cached_state = state.clone();
        state
    }

    pub fn play(&self) -> Result<()> {
        if let Some(session) = self.current_session() {
            session.TryPlayAsync()?.join()?;
        }
        Ok(())
    }

    pub fn pause(&self) -> Result<()> {
        if let Some(session) = self.current_session() {
            session.TryPauseAsync()?.join()?;
        }
        Ok(())
    }

    pub fn toggle_play_pause(&self) -> Result<()> {
        if let Some(session) = self.current_session() {
            session.TryTogglePlayPauseAsync()?.join()?;
        }
        Ok(())
    }

    pub fn next(&self) -> Result<()> {
        if let Some(session) = self.current_session() {
            session.TrySkipNextAsync()?.join()?;
        }
        Ok(())
    }

    pub fn prev(&self) -> Result<()> {
        if let Some(session) = self.current_session() {
            session.TrySkipPreviousAsync()?.join()?;
        }
        Ok(())
    }

    pub fn seek(&self, position_sec: f64) -> Result<()> {
        if let Some(session) = self.current_session() {
            let ticks = (position_sec * 10_000_000.0) as i64;
            session.TryChangePlaybackPositionAsync(ticks)?.join()?;
        }
        Ok(())
    }
}
