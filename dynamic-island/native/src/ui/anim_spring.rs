//! Animator pegas kritis-teredam (spring) untuk transisi kapsul.
//! Hanya "hidup" selama nilai belum mencapai target, sehingga render loop
//! berhenti total (0 frame) saat UI diam.

#[derive(Clone, Copy, Debug)]
pub struct Spring {
    pub value: f32,
    pub target: f32,
    velocity: f32,
    stiffness: f32,
    damping: f32,
}

impl Spring {
    pub fn new(value: f32, stiffness: f32, damping: f32) -> Self {
        Self { value, target: value, velocity: 0.0, stiffness, damping }
    }

    pub fn set_target(&mut self, target: f32) {
        self.target = target;
    }

    /// Ubah karakter pegas (mis. membuka = sedikit memantul, menutup = tanpa overshoot).
    pub fn tune(&mut self, stiffness: f32, damping: f32) {
        self.stiffness = stiffness;
        self.damping = damping;
    }

    pub fn snap(&mut self, value: f32) {
        self.value = value;
        self.target = value;
        self.velocity = 0.0;
    }

    pub fn is_settled(&self) -> bool {
        (self.target - self.value).abs() < 0.05 && self.velocity.abs() < 0.05
    }

    /// Maju satu langkah waktu `dt` (detik). Mengembalikan `true` jika masih bergerak.
    pub fn step(&mut self, dt: f32) -> bool {
        if self.is_settled() {
            self.value = self.target;
            self.velocity = 0.0;
            return false;
        }
        // Sub-step agar stabil walau frame terlambat
        let steps = ((dt / 0.004).ceil() as i32).clamp(1, 16);
        let h = dt / steps as f32;
        for _ in 0..steps {
            let force = self.stiffness * (self.target - self.value) - self.damping * self.velocity;
            self.velocity += force * h;
            self.value += self.velocity * h;
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spring_settles_to_target() {
        let mut s = Spring::new(0.0, 320.0, 30.0);
        s.set_target(100.0);
        let mut frames = 0;
        while s.step(1.0 / 60.0) {
            frames += 1;
            assert!(frames < 600, "spring never settled");
        }
        assert!((s.value - 100.0).abs() < 0.001);
    }
}
