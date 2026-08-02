(()=>{
"use strict";

const originalPrompt=window.prompt.bind(window);

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
