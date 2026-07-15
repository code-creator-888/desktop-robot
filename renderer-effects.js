(function () {
  function createEffectsController(deps) {
    const {
      petEl,
      container,
      snoozeBar,
      speechBubble,
      showSpeech,
      setMouseCapture,
      updateMouseCapture,
      render,
      isUserInteracting,
      setDoubleClickAnimating,
      getSingleClickLines
    } = deps;

    const DOUBLE_CLICK_LINES = [
      () => '（全息校准）收到双击信号，已进入高亮模式。',
      () => '（重力核心点亮）主人，我在这里。',
      () => '（环形光轨展开）双击指令确认，开始陪伴巡航。',
      () => {
        const h = new Date().getHours();
        if (h < 6) return '（低亮护眼模式）夜深了，我陪你安静一点。';
        if (h < 12) return '（晨间光谱上线）早上好，今天的状态很稳。';
        if (h < 18) return '（能量环同步）下午任务继续，我帮你盯着。';
        if (h < 22) return '（夜航灯开启）晚上好，工作台已待命。';
        return '（休眠光环闪烁）该慢慢收尾了，主人。';
      },
      async () => {
        const stats = await window.electronAPI.getSystemStats().catch(() => null);
        if (!stats || stats.error) return '（传感器自检）本机状态暂时读不到，但我在线。';
        const cpu = parseInt(stats.cpu);
        if (cpu > 80) return `（核心升温）CPU ${stats.cpu}！！建议收束几个进程。`;
        if (cpu > 50) return `（散热环启动）CPU ${stats.cpu}，还行还行，负载中等。`;
        return `（状态灯常亮）CPU 才 ${stats.cpu}，运行很轻。`;
      },
      () => {
        const modes = ['全息扫描', '轨道同步', '重力脉冲', '量子眨眼', '推进器点火'];
        return `（${modes[Math.floor(Math.random() * modes.length)]}）双击已确认。`;
      }
    ];
    const DOUBLE_CLICK_WINDOW_MS = 450;
    const DOUBLE_CLICK_EFFECTS = [
      { className: 'dbl-holo-scan', durationMs: 980, particles: 'hologram', glowColor: 'rgba(104,247,255,0.72)' },
      {
        className: 'dbl-gravity-pulse',
        durationMs: 1120,
        particles: 'orbit',
        glowColor: 'rgba(166,141,255,0.72)',
        impact: true
      },
      { className: 'dbl-orbit-flare', durationMs: 1260, particles: 'photons', glowColor: 'rgba(125,249,255,0.68)' }
    ];
    let doubleClickEffectIndex = 0;

    const YAWN_ACTIONS = [
      {
        key: 'yawn',
        className: 'yawn-yawn',
        containerClass: 'idle-yawning',
        durationMs: 1100,
        line: '（打哈欠）好困……'
      },
      {
        key: 'stretch',
        className: 'yawn-stretch',
        containerClass: 'idle-stretching',
        durationMs: 1500,
        line: '（伸懒腰）啊——好舒服~'
      },
      {
        key: 'rub-eyes',
        className: 'yawn-rub-eyes',
        containerClass: 'idle-rubbing',
        durationMs: 1200,
        line: '（揉眼睛）有点想睡觉了……'
      }
    ];

    let clickCount = 0;
    let clickTimer = null;

    function handleRobotClick() {
      // Ignore global hit-test clicks while interacting with reminder snooze controls.
      if (!snoozeBar.classList.contains('hidden')) return;
      clickCount++;
      console.log('[click] robot-click, clickCount=', clickCount);

      // If news bubble is showing, refresh immediately
      if (!speechBubble.classList.contains('hidden') && speechBubble.classList.contains('news')) {
        clickCount = 0;
        clearTimeout(clickTimer);
        (async () => {
          const fn = getSingleClickLines()[0];
          const result = await fn();
          if (result && typeof result === 'object' && result.text) {
            showSpeech(result.text, result.duration || 3500, false, result.type);
          } else {
            showSpeech(result, 3500);
          }
        })();
        return;
      }

      clearTimeout(clickTimer);
      clickTimer = setTimeout(async () => {
        const count = clickCount;
        clickCount = 0;
        console.log('[click] timer fired, count=', count);

        if (count === 1) {
          const fn = getSingleClickLines()[Math.floor(Math.random() * getSingleClickLines().length)];
          const result = await fn();
          if (result && typeof result === 'object' && result.text) {
            showSpeech(result.text, result.duration || 3500, false, result.type);
          } else {
            showSpeech(result, 3500);
          }
        } else if (count >= 2) {
          const lineFn = DOUBLE_CLICK_LINES[Math.floor(Math.random() * DOUBLE_CLICK_LINES.length)];
          const line = await lineFn();
          const effect = DOUBLE_CLICK_EFFECTS[doubleClickEffectIndex];
          doubleClickEffectIndex = (doubleClickEffectIndex + 1) % DOUBLE_CLICK_EFFECTS.length;
          showSpeech(line, 4000);
          petEl.classList.remove('idle');
          petEl.classList.add(effect.className);
          setDoubleClickAnimating(true);
          setMouseCapture(true);

          // Screen shake
          container.classList.add('shake');
          setTimeout(() => container.classList.remove('shake'), 500);

          // Glow ring
          spawnGlowRing(effect.glowColor);

          // Particles
          if (effect.particles === 'hologram') spawnHologramShards(12);
          else if (effect.particles === 'orbit') spawnOrbitDots(10);
          else if (effect.particles === 'photons') spawnPhotonSparks(14);

          // Impact ring for bounce
          if (effect.impact) {
            setTimeout(() => spawnImpactRing(), 520);
          }

          setTimeout(() => {
            petEl.classList.remove(effect.className);
            petEl.style.removeProperty('filter');
            setDoubleClickAnimating(false);
            render();
            updateMouseCapture();
          }, effect.durationMs);
        }
      }, DOUBLE_CLICK_WINDOW_MS);
    }

    function spawnHologramShards(count = 10) {
      for (let i = 0; i < count; i++) {
        const shard = document.createElement('div');
        shard.className = 'hologram-shard';
        shard.style.left = '50%';
        shard.style.bottom = '52px';
        shard.style.animationDelay = i * 0.025 + 's';

        const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.35;
        const dist = 38 + Math.random() * 42;
        shard.style.setProperty('--sx', Math.cos(angle) * dist + 'px');
        shard.style.setProperty('--sy', Math.sin(angle) * dist - 12 + 'px');
        shard.style.setProperty('--sr', (Math.random() * 160 - 80).toFixed(1) + 'deg');
        shard.style.setProperty('--dur', (0.52 + Math.random() * 0.28).toFixed(2) + 's');

        container.appendChild(shard);
        shard.addEventListener('animationend', () => shard.remove(), { once: true });
      }
    }

    function spawnOrbitDots(count = 8) {
      for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'orbit-dot';
        dot.style.left = '50%';
        dot.style.bottom = '50px';
        dot.style.animationDelay = i * 0.04 + 's';
        dot.style.setProperty('--orbit-angle', ((360 / count) * i).toFixed(1) + 'deg');
        dot.style.setProperty('--orbit-radius', (34 + Math.random() * 22).toFixed(1) + 'px');
        container.appendChild(dot);
        dot.addEventListener('animationend', () => dot.remove(), { once: true });
      }
    }

    function spawnPhotonSparks(count = 12) {
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('div');
        spark.className = 'photon-spark';
        spark.style.left = '50%';
        spark.style.bottom = '52px';
        spark.style.animationDelay = i * 0.022 + 's';

        const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.45;
        const dist = 34 + Math.random() * 52;
        spark.style.setProperty('--px', Math.cos(angle) * dist + 'px');
        spark.style.setProperty('--py', Math.sin(angle) * dist - 18 + 'px');
        spark.style.setProperty('--ps', (0.75 + Math.random() * 0.8).toFixed(2));

        container.appendChild(spark);
        spark.addEventListener('animationend', () => spark.remove(), { once: true });
      }
    }

    function spawnGlowRing(color = 'rgba(255,77,121,0.6)') {
      const ring = document.createElement('div');
      ring.className = 'glow-ring';
      ring.style.setProperty('--glow-color', color);
      container.appendChild(ring);
      ring.addEventListener('animationend', () => ring.remove(), { once: true });
    }

    function spawnImpactRing() {
      const ring = document.createElement('div');
      ring.className = 'impact-ring';
      container.appendChild(ring);
      ring.addEventListener('animationend', () => ring.remove(), { once: true });
    }

    // --- Idle animations (yawn) ---
    let isIdleAnimating = false;
    let idleYawnTimer = null;

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function triggerYawn(actionKey = null, force = false) {
      if (isIdleAnimating || (!force && isUserInteracting())) return;
      isIdleAnimating = true;

      const action = actionKey
        ? YAWN_ACTIONS.find((a) => a.key === actionKey)
        : YAWN_ACTIONS[Math.floor(Math.random() * YAWN_ACTIONS.length)];
      const chosen = action || YAWN_ACTIONS[0];
      showSpeech(chosen.line, chosen.durationMs + 1200);

      container.classList.add(chosen.containerClass);
      petEl.classList.remove('idle');
      petEl.classList.add(chosen.className);
      petEl.addEventListener('animationend', function onYawnEnd() {
        petEl.removeEventListener('animationend', onYawnEnd);
        petEl.classList.remove(chosen.className);
        container.classList.remove(chosen.containerClass);
        render();
        isIdleAnimating = false;
      });
    }

    function scheduleYawn() {
      stopYawn();
      const delay = randomBetween(3 * 60 * 1000, 8 * 60 * 1000);
      idleYawnTimer = setTimeout(() => {
        triggerYawn();
        scheduleYawn();
      }, delay);
    }

    function stopYawn() {
      if (idleYawnTimer) {
        clearTimeout(idleYawnTimer);
        idleYawnTimer = null;
      }
    }

    function clearIdleActionClasses() {
      petEl.classList.remove('yawn-yawn', 'yawn-stretch', 'yawn-rub-eyes');
      container.classList.remove('idle-yawning', 'idle-stretching', 'idle-rubbing');
    }

    function startIdleAnimations() {
      scheduleYawn();
    }

    function stopIdleAnimations() {
      stopYawn();
    }

    function resumeIdleAnimationsIfAllowed() {
      if (!isUserInteracting()) startIdleAnimations();
    }

    function testIdleAnimation(kind) {
      stopIdleAnimations();
      isIdleAnimating = false;
      clearIdleActionClasses();
      if (kind === 'yawn') {
        triggerYawn('yawn', true);
      } else if (kind === 'stretch') {
        triggerYawn('stretch', true);
      } else if (kind === 'rub-eyes') {
        triggerYawn('rub-eyes', true);
      }
    }

    function bindRobotClick() {
      window.electronAPI.onRobotClick(handleRobotClick);
    }

    return {
      bindRobotClick,
      startIdleAnimations,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      testIdleAnimation
    };
  }

  window.RobotEffects = {
    createEffectsController
  };
})();
