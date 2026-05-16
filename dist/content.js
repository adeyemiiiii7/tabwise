var e=null,t=null;function n(){try{return!!chrome.runtime?.id}catch{return!1}}function r(r,i,a,o,s){t&&t.remove(),e&&=(clearTimeout(e),null);let c=s===`ask`,l=document.createElement(`div`);l.id=`tabwise-toast`,t=l,l.innerHTML=`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      #tabwise-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #111;
        border: 1px solid ${c?`#555`:`#2a2a2a`};
        border-radius: 12px;
        padding: 0;
        font-family: 'Space Grotesk', -apple-system, sans-serif;
        box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
        display: flex;
        flex-direction: column;
        min-width: 280px;
        max-width: 340px;
        animation: tw-in 0.22s cubic-bezier(0.16,1,0.3,1);
        user-select: none;
      }
      @keyframes tw-in {
        from { transform: translateY(20px) scale(0.96); opacity: 0; }
        to   { transform: translateY(0)    scale(1);    opacity: 1; }
      }
      #tabwise-toast .tw-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 11px 14px 8px;
        cursor: grab;
        border-bottom: 1px solid #1e1e1e;
      }
      #tabwise-toast .tw-handle:active { cursor: grabbing; }
      #tabwise-toast .tw-badge {
        font-size: 9px;
        font-weight: 700;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      #tabwise-toast .tw-badge.ask { color: #aaa; }
      #tabwise-toast .tw-close {
        background: none;
        border: none;
        color: #666;
        font-size: 13px;
        cursor: pointer;
        padding: 2px 4px;
        line-height: 1;
        margin-left: auto;
        flex-shrink: 0;
        transition: color 0.12s;
        border-radius: 4px;
      }
      #tabwise-toast .tw-close:hover { color: #ddd; background: #222; }
      #tabwise-toast .tw-body {
        padding: 10px 14px 8px;
      }
      #tabwise-toast .tw-domain {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #999;
        font-weight: 500;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #tabwise-toast .tw-question {
        font-size: 13px;
        font-weight: 600;
        color: #f0f0f0;
        line-height: 1.4;
      }
      #tabwise-toast .tw-question strong { color: #fff; }
      #tabwise-toast .tw-cats {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 14px 12px;
      }
      #tabwise-toast .tw-btn {
        padding: 6px 13px;
        background: #1a1a1a;
        border: 1px solid #3a3a3a;
        border-radius: 20px;
        color: #ccc;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
        font-family: 'Space Grotesk', sans-serif;
        letter-spacing: 0.02em;
      }
      #tabwise-toast .tw-btn:hover { border-color: #aaa; color: #fff; background: #222; }
      #tabwise-toast .tw-btn.active { border-color: #fff; background: #fff; color: #111; }
      #tabwise-toast .tw-footer {
        font-size: 10px;
        color: #666;
        font-family: 'JetBrains Mono', monospace;
        padding: 8px 14px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border-top: 1px solid #1e1e1e;
      }
      #tabwise-toast .tw-dismiss {
        background: none;
        border: none;
        color: #666;
        font-size: 10px;
        font-family: 'JetBrains Mono', monospace;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
        text-underline-offset: 2px;
        transition: color 0.12s;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #tabwise-toast .tw-dismiss:hover { color: #bbb; }
    </style>

    <div class="tw-handle" id="tw-handle">
      <span class="tw-badge ${c?`ask`:``}">
        ${c?`? Tabwise is asking`:`✓ Tabwise organised`}
      </span>
      <button class="tw-close" id="tw-close-btn" title="Dismiss">✕</button>
    </div>

    <div class="tw-body">
      <div class="tw-domain">${r}</div>
      <div class="tw-question">
        ${c?`Where does this tab belong?`:`Moved to <strong>${i}</strong>. Correct?`}
      </div>
    </div>

    <div class="tw-cats" id="tw-cat-list"></div>

    <div class="tw-footer">
      <span>${c?`Pick once — Tabwise remembers it.`:`Auto-closes in 8s.`}</span>
      ${c?`<button class="tw-dismiss" id="tw-skip-btn">Skip for now</button>`:``}
    </div>
  `,document.body.appendChild(l);function u(){e&&=(clearTimeout(e),null),document.removeEventListener(`mousemove`,v),document.removeEventListener(`mouseup`,y),l.remove(),t=null}l.querySelector(`#tw-close-btn`)?.addEventListener(`click`,u),l.querySelector(`#tw-skip-btn`)?.addEventListener(`click`,u),c||(e=setTimeout(u,8e3));let d=l.querySelector(`#tw-cat-list`);a.forEach(t=>{let a=document.createElement(`button`);a.className=`tw-btn`+(t===i?` active`:``),a.textContent=t,a.addEventListener(`click`,()=>{if(e&&clearTimeout(e),n())try{chrome.runtime.sendMessage({type:`REASSIGN_TAB`,tabId:o,category:t,learnDomain:r})}catch{}d.querySelectorAll(`.tw-btn`).forEach(e=>e.classList.remove(`active`)),a.classList.add(`active`),setTimeout(u,600)}),d.appendChild(a)});let f=l.querySelector(`#tw-handle`),p=!1,m=0,h=0,g=0,_=0;f.addEventListener(`mousedown`,e=>{if(e.target.closest(`button`))return;p=!0;let t=l.getBoundingClientRect();l.style.bottom=`auto`,l.style.right=`auto`,l.style.top=t.top+`px`,l.style.left=t.left+`px`,g=t.left,_=t.top,m=e.clientX,h=e.clientY,e.preventDefault()});function v(e){if(!p)return;let t=e.clientX-m,n=e.clientY-h,r=Math.max(0,Math.min(window.innerWidth-l.offsetWidth,g+t)),i=Math.max(0,Math.min(window.innerHeight-l.offsetHeight,_+n));l.style.left=r+`px`,l.style.top=i+`px`}function y(){p=!1}document.addEventListener(`mousemove`,v),document.addEventListener(`mouseup`,y)}try{chrome.runtime.onMessage.addListener(e=>{try{e.type===`SHOW_TOAST`&&r(e.domain,e.category,e.categories,e.tabId,e.mode)}catch{}})}catch{}