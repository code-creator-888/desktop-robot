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
  () => '（转圈圈）主人！我最喜欢你了！♥',
  () => '（发射爱心光线）主人你是最棒的！',
  () => '（害羞地捂脸）人家才不是特别喜欢你呢……才不是……',
  () => '（兴奋地跳起来）主人终于来陪我玩了！！',
  () => {
    const h = new Date().getHours();
    if (h < 6) return '（揉眼睛）主人还没睡吗……心疼你……';
    if (h < 12) return '（元气满满）早上好！今天也要加油哦！☀';
    if (h < 14) return '（摸摸肚子）主人吃过午饭了吗？别饿着！';
    if (h < 18) return '（伸懒腰）下午了呢，要不要休息一下？';
    if (h < 22) return '（靠过来）晚上陪主人加班，我最强！';
    return '（打哈欠）主人该睡觉啦，熬夜对身体不好哦~';
  },
  async () => {
    const stats = await window.electronAPI.getSystemStats().catch(() => null);
    if (!stats || stats.error) return '（竖起天线）系统一切正常！嗯……大概吧。';
    const cpu = parseInt(stats.cpu);
    if (cpu > 80) return `（冒烟）CPU ${stats.cpu}！！主人快关几个程序吧，我要热化了！🔥`;
    if (cpu > 50) return `（擦汗）CPU ${stats.cpu}，还行还行，我还能撑住！`;
    return `（得意）CPU 才 ${stats.cpu}，多亏我帮你监控着呢~`;
  },
  () => {
    const moods = ['超开心', '有点小激动', '感动得不行', '幸福到冒泡', '开心到原地起飞'];
    const actions = ['转圈圈', '蹦蹦跳跳', '挥舞小手', '闪亮登场', '撒花花'];
    return `（${actions[Math.floor(Math.random() * actions.length)]}）主人连点我！我${moods[Math.floor(Math.random() * moods.length)]}！♥`;
  },
  () => {
    const picks = [
      '主人是不是想我了？我一直在哦！',
      '双击！这是爱的信号对吧！对吧！',
      '（脸红）主人不要一直戳我啦……虽然也不讨厌……',
      '收到主人的双倍爱意！电量充满！⚡',
      '嘿嘿，被主人关注的感觉真好~',
    ];
    return picks[Math.floor(Math.random() * picks.length)];
  },
  () => '（踩着节拍）双击收到！开始跳舞模式！🎵',
];
const DOUBLE_CLICK_WINDOW_MS = 450;
const DOUBLE_CLICK_EFFECTS = [
  { className: 'dbl-glitch', durationMs: 920, particles: 'sparkles', glowColor: 'rgba(34,211,238,0.65)' },
  { className: 'dbl-stomp',  durationMs: 1050, particles: 'mixed',   glowColor: 'rgba(251,146,60,0.62)', impact: true },
  { className: 'dbl-disco',  durationMs: 1200, particles: 'music',   glowColor: 'rgba(168,85,247,0.68)' },
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
  },
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
      if (effect.particles === 'hearts') spawnHearts(7);
      else if (effect.particles === 'sparkles') spawnSparkles(10);
      else if (effect.particles === 'music') spawnMusicNotes(9);
      else if (effect.particles === 'mixed') { spawnHearts(4); spawnSparkles(6); }

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

function spawnHearts(count = 5) {
  for (let i = 0; i < count; i++) {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = ['♥', '♡', '❤'][Math.floor(Math.random() * 3)];
    const offsetX = (Math.random() - 0.5) * 80;
    heart.style.setProperty('--hx', offsetX + 'px');
    heart.style.left = '50%';
    heart.style.bottom = '70px';
    heart.style.animationDelay = (i * 0.08) + 's';
    heart.style.fontSize = (14 + Math.random() * 10) + 'px';
    container.appendChild(heart);
    heart.addEventListener('animationend', () => heart.remove(), { once: true });
  }
}

function spawnSparkles(count = 10) {
  const chars = ['✦', '✧', '⋆', '★', '✶', '✸'];
  const colors = ['#FFD700', '#FF69B4', '#00E5FF', '#FF6B6B', '#A78BFA', '#34D399'];
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'sparkle-particle';
    spark.textContent = chars[Math.floor(Math.random() * chars.length)];
    spark.style.color = colors[Math.floor(Math.random() * colors.length)];
    spark.style.fontSize = (8 + Math.random() * 14) + 'px';
    spark.style.left = '50%';
    spark.style.bottom = '50px';

    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
    const dist = 30 + Math.random() * 40;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const tx2 = tx * 1.5;
    const ty2 = ty - 20;
    spark.style.setProperty('--tx', tx + 'px');
    spark.style.setProperty('--ty', ty + 'px');
    spark.style.setProperty('--tx2', tx2 + 'px');
    spark.style.setProperty('--ty2', ty2 + 'px');
    spark.style.setProperty('--dur', (0.5 + Math.random() * 0.4) + 's');
    spark.style.animationDelay = (i * 0.03) + 's';
    spark.style.textShadow = `0 0 6px ${spark.style.color}`;

    container.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
  }
}

function spawnMusicNotes(count = 8) {
  const notes = ['♪', '♫', '♩', '♬'];
  const colors = ['#8B5CF6', '#EC4899', '#22D3EE', '#F59E0B', '#34D399'];
  for (let i = 0; i < count; i++) {
    const note = document.createElement('div');
    note.className = 'music-note-particle';
    note.textContent = notes[Math.floor(Math.random() * notes.length)];
    note.style.color = colors[Math.floor(Math.random() * colors.length)];
    note.style.fontSize = (16 + Math.random() * 10) + 'px';
    note.style.left = '50%';
    note.style.bottom = '52px';
    note.style.animationDelay = (i * 0.04) + 's';
    note.style.setProperty('--note-x', ((Math.random() - 0.5) * 120) + 'px');
    note.style.setProperty('--note-top', (70 + Math.random() * 60) + 'px');
    note.style.textShadow = `0 0 8px ${note.style.color}`;
    container.appendChild(note);
    note.addEventListener('animationend', () => note.remove(), { once: true });
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
    ? YAWN_ACTIONS.find(a => a.key === actionKey)
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
  if (idleYawnTimer) { clearTimeout(idleYawnTimer); idleYawnTimer = null; }
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
