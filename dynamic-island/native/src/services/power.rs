//! Layanan Pemantau Baterai & Daya Laptop / Perangkat (GetSystemPowerStatus).

use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PowerStatus {
    pub ac_online: bool,
    pub battery_percent: u8,
    pub is_charging: bool,
    pub has_battery: bool,
}

pub fn get_power_status() -> PowerStatus {
    unsafe {
        let mut status = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut status).is_ok() {
            let ac_online = status.ACLineStatus == 1;
            let battery_percent = if status.BatteryLifePercent <= 100 {
                status.BatteryLifePercent
            } else {
                100
            };
            let is_charging = (status.BatteryFlag & 8) != 0 || ac_online;
            let has_battery = (status.BatteryFlag & 128) == 0 && status.BatteryFlag != 255;
            PowerStatus {
                ac_online,
                battery_percent,
                is_charging,
                has_battery,
            }
        } else {
            PowerStatus {
                ac_online: true,
                battery_percent: 100,
                is_charging: false,
                has_battery: false,
            }
        }
    }
}
