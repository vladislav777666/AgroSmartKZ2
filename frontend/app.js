async function apiGet(url) {
    const res = await fetch(CONFIG.API_URL + url);
    return res.json();
}

window.onPageLoad = async function(page) {
    if (page === "prognoz") {
        const data = await apiGet("/weather/current?region=Алматы");
        document.getElementById("prognoz-box").innerHTML =
            `<div class="card">Температура: ${data.temp}°C</div>`;
    }

    if (page === "earts") {
        const soils = await apiGet("/soil?region=Алматы");
        document.getElementById("soil-box").innerHTML =
            soils.map(s => `<div class='card'>${s}</div>`).join('');
    }
};
