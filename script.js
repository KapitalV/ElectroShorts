'use strict';
    (() => {
      const $ = (s, p = document) => p.querySelector(s);
      const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

      // Header Scroll Styling
      const header = $('#site-header');
      window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 20);
      }, { passive: true });

      // Mobile Menu Toggle
      const mobileBtn = $('#mobile-menu-btn');
      const mainNav = $('#main-nav');
      if (mobileBtn && mainNav) {
        mobileBtn.addEventListener('click', () => {
          const isOpen = mainNav.classList.toggle('open');
          mobileBtn.setAttribute('aria-expanded', String(isOpen));
        });
        $$('#main-nav a').forEach(link => {
          link.addEventListener('click', () => {
            mainNav.classList.remove('open');
            mobileBtn.setAttribute('aria-expanded', 'false');
          });
        });
      }

      // Download / Notice Modal
      const notice = $('#notice');
      const noticeTitle = $('#notice-title');
      const noticeCopy = $('#notice-copy');
      const noticeClose = $('#notice-close');

      const noticeMessages = {
        download: [
          'Windows x64 Installer',
          'ElectroShorts v2.4 (Setup.exe) preview. Full release build ready for Windows 10 & 11 x64 systems with NVIDIA CUDA support.'
        ],
        github: [
          'GitHub Source Preview',
          'Open developer specifications and Python local worker pipeline are available in the creator documentation.'
        ]
      };

      $$('[data-notice]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const key = btn.dataset.notice;
          const [title, copy] = noticeMessages[key] || ['Notice', 'Action triggered'];
          noticeTitle.textContent = title;
          noticeCopy.textContent = copy;
          notice.classList.add('show');
          clearTimeout(notice._timer);
          notice._timer = setTimeout(() => notice.classList.remove('show'), 5000);
        });
      });

      if (noticeClose) {
        noticeClose.addEventListener('click', () => notice.classList.remove('show'));
      }

      // Studio Interactive Data
      const clips = [
        {
          duration: 38,
          start: 754,
          title: "You don't need more ideas",
          score: "VIRAL SCORE · 96 🔥",
          quoteText: ["“You don't need ", "more ideas.", " You need to give the one you believe in a real chance.”"],
          lines: [
            ["YOU DON'T NEED", "MORE IDEAS."],
            ["GIVE THE ONE", "YOU BELIEVE IN"],
            ["A REAL", "CHANCE."]
          ]
        },
        {
          duration: 32,
          start: 1266,
          title: "Start before you're ready",
          score: "VIRAL SCORE · 92 ⚡",
          quoteText: ["“You'll never feel ", "completely ready.", " The first version is how you learn what the next one needs.”"],
          lines: [
            ["YOU'LL NEVER FEEL", "COMPLETELY READY."],
            ["THE FIRST VERSION", "IS HOW YOU LEARN"],
            ["START BEFORE", "YOU'RE READY."]
          ]
        },
        {
          duration: 44,
          start: 1722,
          title: "Consistency isn't a streak",
          score: "VIRAL SCORE · 89 ✨",
          quoteText: ["“Consistency isn't ", "a perfect streak.", " It's deciding that one missed day doesn't get to become your story.”"],
          lines: [
            ["CONSISTENCY ISN'T", "A PERFECT STREAK."],
            ["ONE MISSED DAY", "IS JUST ONE DAY."],
            ["IT ISN'T YOUR", "WHOLE STORY."]
          ]
        }
      ];

      let currentClipIdx = 0;
      let activeColor = 'lime';
      let activeLineIdx = -1;
      let playTimer = null;

      const timeline = $('#timeline');
      const timeDisplay = $('#time-display');
      const sourceTime = $('#source-time');
      const sourceBadgeTime = $('#source-badge-time');
      const shortCaption = $('#short-caption');
      const shortPill = $('#short-pill');
      const transcriptBox = $('#transcript-box');
      const playToggle = $('#play-toggle');
      const appFrame = $('.app-frame');
      const statusIndicator = $('#status-indicator');
      const sourceVideoEl = $('#source-video-el');
      const shortVideoEl = $('#short-video-el');

      const colorMap = {
        lime: '#10b981',
        blue: '#3b82f6',
        yellow: '#f59e0b',
        pink: '#ec4899'
      };

      function formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      function getEffectiveDuration(clip) {
        if (sourceVideoEl && sourceVideoEl.duration && isFinite(sourceVideoEl.duration) && sourceVideoEl.duration > 1) {
          return Math.round(sourceVideoEl.duration);
        }
        return clip.duration;
      }

      function updateRender() {
        const clip = clips[currentClipIdx];
        const totalDur = getEffectiveDuration(clip);
        const val = Math.min(Number(timeline.value), totalDur);
        timeDisplay.textContent = `${formatTime(val)} / ${formatTime(totalDur)}`;
        sourceTime.textContent = `${formatTime(clip.start + val)} / 42:18`;
        if (sourceBadgeTime) sourceBadgeTime.textContent = formatTime(clip.start + val);

        // Sync video time smoothly without premature modulo loops
        if (sourceVideoEl && sourceVideoEl.duration) {
          const target = Math.min(val, Math.max(0, sourceVideoEl.duration - 0.05));
          if (Math.abs(sourceVideoEl.currentTime - target) > 0.4) {
            sourceVideoEl.currentTime = target;
          }
        }
        if (shortVideoEl && shortVideoEl.duration) {
          const target = Math.min(val, Math.max(0, shortVideoEl.duration - 0.05));
          if (Math.abs(shortVideoEl.currentTime - target) > 0.4) {
            shortVideoEl.currentTime = target;
          }
        }

        // Update long video time and master playhead
        const longSecs = clip.start + val;
        const longVideoCurEl = $('#long-video-current-time');
        if (longVideoCurEl) longVideoCurEl.textContent = `Time in Long Video: ${formatTime(longSecs)}`;

        const masterPlayhead = $('#master-playhead');
        if (masterPlayhead) {
          const totalSecs = 2538;
          const pct = Math.min(100, Math.max(0, (longSecs / totalSecs) * 100));
          masterPlayhead.style.left = `${pct}%`;
        }

        // Update face bounding box subtle motion based on timeline
        const faceBox = $('#face-box');
        if (faceBox) {
          const shift = Math.sin(val * 0.4) * 8;
          faceBox.style.transform = `translateX(${shift}px)`;
        }

        // Calculate line index
        const lineIdx = Math.min(clip.lines.length - 1, Math.floor((val / totalDur) * clip.lines.length));
        if (lineIdx === activeLineIdx) return;
        activeLineIdx = lineIdx;

        const [partA, partB] = clip.lines[lineIdx];
        const span = document.createElement('span');
        span.className = 'active-word';
        span.style.color = colorMap[activeColor] || '#10b981';
        span.textContent = partB;

        shortCaption.replaceChildren(document.createTextNode(partA), document.createElement('br'), span);
      }

      function restartLoop() {
        timeline.value = '0';
        if (sourceVideoEl) sourceVideoEl.currentTime = 0;
        if (shortVideoEl) shortVideoEl.currentTime = 0;
        if (sourceVideoEl) sourceVideoEl.play().catch(() => {});
        if (shortVideoEl) shortVideoEl.play().catch(() => {});
        updateRender();
      }

      function setPlaying(play) {
        if (playTimer) {
          clearInterval(playTimer);
          playTimer = null;
        }

        playToggle.setAttribute('aria-pressed', String(play));
        const useEl = $('use', playToggle);
        if (useEl) useEl.setAttribute('href', play ? '#icon-pause' : '#icon-play');

        if (play) {
          const totalDur = getEffectiveDuration(clips[currentClipIdx]);
          if (Number(timeline.value) >= totalDur) {
            timeline.value = '0';
            if (sourceVideoEl) sourceVideoEl.currentTime = 0;
            if (shortVideoEl) shortVideoEl.currentTime = 0;
          }
          if (sourceVideoEl) {
            sourceVideoEl.play().catch(() => {});
          }
          if (shortVideoEl) {
            shortVideoEl.play().catch(() => {});
          }
          updateRender();
          playTimer = setInterval(() => {
            const currentDur = getEffectiveDuration(clips[currentClipIdx]);
            const nextVal = Number(timeline.value) + 1;
            if (nextVal >= currentDur) {
              // After running full video interview time, start loop
              restartLoop();
            } else {
              timeline.value = String(nextVal);
              updateRender();
            }
          }, 1000);
        } else {
          if (sourceVideoEl) sourceVideoEl.pause();
          if (shortVideoEl) shortVideoEl.pause();
        }
      }

      function selectClip(idx) {
        setPlaying(false);
        currentClipIdx = idx;
        activeLineIdx = -1;
        const clip = clips[idx];
        const dur = getEffectiveDuration(clip);

        timeline.max = String(dur);
        timeline.value = '0';
        if (sourceVideoEl) sourceVideoEl.currentTime = 0;
        if (shortVideoEl) shortVideoEl.currentTime = 0;

        $$('.clip-card').forEach((card, i) => {
          card.classList.toggle('active', i === idx);
        });

        // Update crop window header & times
        const clipStartFormatted = formatTime(clip.start);
        const clipEndFormatted = formatTime(clip.start + dur);

        const cropWindowTime = $('#crop-window-time');
        if (cropWindowTime) cropWindowTime.textContent = `${clipStartFormatted} → ${clipEndFormatted}`;

        const shortSourceRefBadge = $('#short-source-ref-badge');
        if (shortSourceRefBadge) shortSourceRefBadge.textContent = `AI CUT FROM ${clipStartFormatted}`;

        const masterClipTag = $('#master-clip-tag');
        if (masterClipTag) masterClipTag.textContent = `CLIP 0${idx + 1} (${dur}s)`;

        // Highlight active segment on master timeline
        $$('.hook-segment-block').forEach((block, i) => {
          block.classList.toggle('active', i === idx);
        });

        // Shift crop box slightly depending on speaker position in each clip
        const cropWindow = $('#crop-window');
        if (cropWindow) {
          const offsets = ['28%', '32%', '25%'];
          cropWindow.style.right = offsets[idx] || '28%';
        }

        if (shortPill) shortPill.textContent = clip.score;

        const mark = document.createElement('mark');
        mark.textContent = clip.quoteText[1];
        transcriptBox.replaceChildren(
          document.createTextNode(clip.quoteText[0]),
          mark,
          document.createTextNode(clip.quoteText[2])
        );

        updateRender();
      }

      // Tab Modes
      const tabMessages = {
        hooks: '✦ Hook Detection Mode · Select a clip to explore highest viral-scoring moments',
        reframe: '⌖ Smart Reframe Mode · AI Speaker tracking centering locked for 9:16 vertical view',
        captions: 'T Kinetic Captions Mode · Customize word pop colors and font styles below'
      };

      function setMode(mode) {
        appFrame.dataset.mode = mode;
        $$('.workflow-tab-btn').forEach(btn => {
          const isSelected = btn.dataset.mode === mode;
          btn.classList.toggle('active', isSelected);
          btn.setAttribute('aria-selected', String(isSelected));
        });
        if (statusIndicator) {
          statusIndicator.textContent = tabMessages[mode] || tabMessages.hooks;
        }
      }

      $$('.workflow-tab-btn').forEach(tab => {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
      });

      // Clip Cards Clicking
      $$('.clip-card').forEach((card, idx) => {
        card.addEventListener('click', () => selectClip(idx));
      });

      // Hook Segment Blocks on Master Timeline Track
      $$('.hook-segment-block').forEach((block, idx) => {
        block.addEventListener('click', (e) => {
          e.stopPropagation();
          const clipIdx = Number(block.dataset.clip ?? idx);
          selectClip(clipIdx);
        });
      });

      // Transport Click & Range Input
      playToggle.addEventListener('click', () => setPlaying(!playTimer));
      timeline.addEventListener('input', () => {
        const val = Number(timeline.value);
        if (sourceVideoEl && sourceVideoEl.duration) {
          sourceVideoEl.currentTime = Math.min(val, Math.max(0, sourceVideoEl.duration - 0.05));
        }
        if (shortVideoEl && shortVideoEl.duration) {
          shortVideoEl.currentTime = Math.min(val, Math.max(0, shortVideoEl.duration - 0.05));
        }
        updateRender();
      });

      // Video Ended handlers: after running full video interview time, start loop!
      if (sourceVideoEl) {
        sourceVideoEl.addEventListener('ended', () => {
          if (playTimer || !sourceVideoEl.paused) {
            restartLoop();
          }
        });
        sourceVideoEl.addEventListener('loadedmetadata', () => {
          if (sourceVideoEl.duration && isFinite(sourceVideoEl.duration)) {
            selectClip(currentClipIdx);
          }
        });
      }
      if (shortVideoEl) {
        shortVideoEl.addEventListener('ended', () => {
          if (playTimer || !shortVideoEl.paused) {
            shortVideoEl.currentTime = 0;
            shortVideoEl.play().catch(() => {});
          }
        });
      }

      // Color Swatches
      $$('.swatch-btn').forEach(swatch => {
        swatch.addEventListener('click', () => {
          activeColor = swatch.dataset.color;
          $$('.swatch-btn').forEach(btn => btn.classList.toggle('active', btn === swatch));
          activeLineIdx = -1;
          updateRender();
        });
      });

      // Generate Animated Waveform Bars
      const barsContainer = $('#visual-bars');
      if (barsContainer) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 36; i++) {
          const b = document.createElement('b');
          const heightPct = 15 + Math.abs(Math.sin(i * 1.5) * Math.cos(i * 0.4)) * 80;
          b.style.setProperty('--h', `${heightPct}%`);
          if (i > 10 && i < 26) b.className = 'hit';
          frag.appendChild(b);
        }
        barsContainer.appendChild(frag);
      }

      // Year
      const yearEl = $('#current-year');
      if (yearEl) yearEl.textContent = String(new Date().getFullYear());

      // Init
      selectClip(0);
    })();