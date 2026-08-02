(()=>{
"use strict";

const originalPrompt=window.prompt.bind(window);
const style=document.createElement("style");
style.textContent=`
body.setup-code-open{overflow:hidden}
#florence-setup-code-card{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px}
#florence-setup-code-card .setup-code-backdrop{position:absolute;inset:0;background:rgba(12,25,20,.72);backdrop-filter:blur(4px)}
#florence-setup-code-card .setup-code-card{position:relative;width:min(100%,430px);max-height:calc(100dvh - 40px);overflow:auto;background:#fff;border-radius:24px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
#florence-setup-code-card .setup-code-card h2{margin:.25rem 0 .75rem}
#florence-setup-code-card .setup-code-value{display:block;width:100%;margin:20px 0 12px;padding:18px 12px;border:2px solid #5f8f72;border-radius:16px;background:#f4faf6;font:800 2.15rem/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;text-align:center;color:#173f2c;user-select:all;-webkit-user-select:all}
#florence-setup-code-card .actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
#florence-setup-code-card .notice{margin-top:14px}
@media(max-width:420px){#florence-setup-code-card{padding:12px}#florence-setup-code-card .setup-code-card{padding:20px;border-radius:20px}#florence-setup-code-card .setup-code-value{font-size:1.85rem;letter-spacing:.14em}}
`;
document.head.appendChild(style);

function closeCard(card){
 card?.remove();
 document.body.classList.remove("setup-code-open");
}

function showCodeCard(message){
 const code=(String(message).match(/\b\d{8}\b/)||[])[0];
 if(!code)return originalPrompt("Copy this one-time Florence setup code",message);

 document.querySelector("#florence-setup-code-card")?.remove();
 const card=document.createElement("div");
 card.id="florence-setup-code-card";
 card.setAttribute("role","dialog");
 card.setAttribute("aria-modal","true");
 card.setAttribute("aria-labelledby","florence-setup-code-title");
 card.innerHTML=`
  <div class="setup-code-backdrop"></div>
  <section class="setup-code-card">
   <p class="eyebrow">Private account setup</p>
   <h2 id="florence-setup-code-title">One-time Florence setup code</h2>
   <p>Send this code privately to the person setting up their Florence account.</p>
   <button type="button" class="setup-code-value" data-copy-code aria-label="Copy setup code">${code}</button>
   <p class="record-meta">Expires in 30 minutes and works once.</p>
   <div class="actions">
    <button type="button" class="primary" data-copy-code>Copy code</button>
    <button type="button" class="secondary" data-close-code>Done</button>
   </div>
   <p class="notice hidden" data-copy-status role="status"></p>
  </section>`;
 document.body.appendChild(card);
 document.body.classList.add("setup-code-open");

 const status=card.querySelector("[data-copy-status]");
 const copy=async()=>{
  try{
   await navigator.clipboard.writeText(code);
   status.textContent=`Code ${code} copied`;
  }catch(_error){
   const range=document.createRange();
   const value=card.querySelector(".setup-code-value");
   range.selectNodeContents(value);
   const selection=getSelection();
   selection.removeAllRanges();
   selection.addRange(range);
   status.textContent="Code selected. Tap Copy from the iPhone menu.";
  }
  status.classList.remove("hidden");
 };
 card.querySelectorAll("[data-copy-code]").forEach(button=>button.addEventListener("click",copy));
 card.querySelector("[data-close-code]").addEventListener("click",()=>closeCard(card));
 card.querySelector(".setup-code-backdrop").addEventListener("click",()=>closeCard(card));
 requestAnimationFrame(()=>card.querySelector(".setup-code-value")?.focus());
 return code;
}

window.prompt=(title,message="",defaultValue="")=>{
 if(title==="Copy this one-time Florence setup code")return showCodeCard(message);
 return originalPrompt(title,message,defaultValue);
};
})();
