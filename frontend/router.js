async function navigate(page) {
    const html = await fetch(`pages/${page}.html`).then(r => r.text());
    document.getElementById("app").innerHTML = html;

    if (window.onPageLoad) onPageLoad(page);
}

window.addEventListener("load", () => navigate("main"));
