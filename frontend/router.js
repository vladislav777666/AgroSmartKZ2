async function navigate(page){
  const res = await fetch(`/pages/${page}.html`);
  if(!res.ok) {
    document.getElementById("app").innerHTML = `<div class="card">Страница ${page} не найдена (${res.status})</div>`;
    return;
  }
  const html = await res.text();
  document.getElementById("app").innerHTML = html;
  if(window.onPageLoad) await window.onPageLoad(page);
  window.scrollTo({top:0,behavior:'smooth'});
}
window.addEventListener("load", ()=>navigate("main"));
