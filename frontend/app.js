// Общие утилиты
async function apiGet(url) {
    const res = await fetch(CONFIG.API_URL + url);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
}

async function authMiniApp() {
    if (!window.Telegram || !window.Telegram.WebApp) return;
    const tg = window.Telegram.WebApp;
    const initData = tg.initData || tg.initDataUnsafe || "";
    try {
        await fetch(CONFIG.API_URL + "/auth?initData=" + encodeURIComponent(initData));
        console.log("Auth OK");
    } catch (e) {
        console.warn("Auth failed", e);
    }
}
authMiniApp();

window.onPageLoad = async function(page) {
    try {
        if (page === "main") await loadMain();
        if (page === "prognoz") await loadPrognoz();
        if (page === "earts") await loadEarts();
        if (page === "sort") await loadSort();
        if (page === "nastroi") await loadNastroi();
    } catch (e) {
        console.error(e);
        const el = document.getElementById("app");
        if (el) el.innerHTML += `<div class="card">Ошибка: ${e.message}</div>`;
    }
};

/* -----------------------
   MAIN (главная страница)
   ----------------------- */
async function loadMain() {
    // инициализация интерактивной карты (используем SVG встроенный в main.html)
    const map = document.getElementById("kost-map");
    if (!map) return;

    // данные по районам (пример)
    const districts = {
        "d1": { name: "Район А", soil: "Суглинок", rec: "Внести азот" },
        "d2": { name: "Район Б", soil: "Песок", rec: "Полив" },
        "d3": { name: "Район В", soil: "Супесь", rec: "Органика" },
        "d4": { name: "Район Г", soil: "Чернозём", rec: "Подходит для пшеницы" },
        "d5": { name: "Район Д", soil: "Суглинок", rec: "Мелкие улучшения" }
    };

    // наведение и показ всплывающей подсказки
    const tooltip = document.createElement("div");
    tooltip.id = "map-tooltip";
    tooltip.style.position = "fixed";
    tooltip.style.zIndex = 9999;
    tooltip.style.pointerEvents = "none";
    tooltip.style.padding = "8px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.background = "rgba(0,0,0,0.8)";
    tooltip.style.color = "#fff";
    tooltip.style.fontSize = "13px";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);

    Object.keys(districts).forEach(id => {
        const node = document.getElementById(id);
        if (!node) return;

        node.addEventListener("mouseenter", (ev) => {
            node.setAttribute("fill-opacity", "0.6");
            const d = districts[id];
            tooltip.innerHTML = `<b>${d.name}</b><br/>Тип почвы: ${d.soil}<br/>Рекоменд: ${d.rec}`;
            tooltip.style.display = "block";
        });
        node.addEventListener("mousemove", (ev) => {
            tooltip.style.left = (ev.clientX + 10) + "px";
            tooltip.style.top = (ev.clientY + 10) + "px";
        });
        node.addEventListener("mouseleave", () => {
            node.setAttribute("fill-opacity", "1");
            tooltip.style.display = "none";
        });

        node.addEventListener("click", async () => {
            // при клике — открываем страницу анализа почвы и передаём район
            navigate("earts");
            // сохраним временно выбранный район в sessionStorage
            sessionStorage.setItem("selectedDistrict", id);
        });
    });
}

/* -----------------------
   PROGNOZ (Окно возможностей)
   ----------------------- */
async function loadPrognoz() {
    // элементы
    const regionInput = document.getElementById("region-input");
    const daysInput = document.getElementById("days-input");
    const runBtn = document.getElementById("run-prog");
    const calendarWrap = document.getElementById("calendar-wrap");
    const listWrap = document.getElementById("favorable-list");
    const chartCtx = document.getElementById("weather-chart").getContext("2d");
    let chart;

    function renderCalendar(dates, favorableSet) {
        // dates: array of {date, temp, wind, rain, iso}
        const rows = [];
        rows.push('<div class="calendar">');
        dates.forEach(d => {
            const isFav = favorableSet.has(d.iso);
            rows.push(`<div class="cal-day ${isFav ? 'fav' : ''}" data-iso="${d.iso}">
                <div class="cal-date">${d.label}</div>
                <div class="cal-temp">${d.temp}°C</div>
            </div>`);
        });
        rows.push('</div>');
        calendarWrap.innerHTML = rows.join('');
    }

    function renderList(favorable) {
        if (!favorable.length) {
            listWrap.innerHTML = `<div class="card">Нет благоприятных дней в выбранный период</div>`;
            return;
        }
        listWrap.innerHTML = favorable.map(d => `
            <div class="card">
                <b>${d.label}</b> — ${d.temp}°C, ветер ${d.wind} м/с
            </div>
        `).join('');
    }

    async function fetchAndRender() {
        const region = encodeURIComponent(regionInput.value || "Костанай");
        const days = Number(daysInput.value) || 7;
        // backend возвращает favorable_days и все дни (мы должны сделать запрос прогноза или window)
        let data;
        try {
            data = await apiGet(`/window?region=${region}&days=${days}`);
        } catch (e) {
            calendarWrap.innerHTML = `<div class="card">Ошибка получения прогноза: ${e.message}</div>`;
            return;
        }

        // Собираем даты для календаря — берем favorable_days и создаём период days из today
        const today = new Date();
        const dates = [];
        for (let i = 0; i < Math.max(days, 7); i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const iso = d.toISOString().slice(0,10);
            dates.push({
                iso,
                label: iso.split('-').reverse().join('.'),
                temp: null,
                wind: null,
                rain: 0
            });
        }

        // заполняем temps из favorable_days when available
        const favSet = new Set();
        (data.favorable_days || []).forEach(x => {
            // ожидаем x.date в формате dd.mm.yyyy
            const parts = x.date.split('.');
            const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
            favSet.add(iso);
            // найдём в dates и заполним
            for (const dd of dates) {
                if (dd.iso === iso) {
                    dd.temp = x.temp;
                    dd.wind = x.wind;
                    dd.rain = x.rain || 0;
                }
            }
        });

        // подготовка графика — возьмём температуры (если temp null — поставим NaN)
        const labels = dates.map(d => d.label);
        const temps = dates.map(d => (d.temp === null ? NaN : d.temp));
        if (chart) chart.destroy();
        chart = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Температура (°C)',
                    data: temps,
                    tension: 0.3,
                    spanGaps: true,
                    fill: false,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: false } }
            }
        });

        renderCalendar(dates, favSet);
        renderList(data.favorable_days || []);
    }

    // привязка событий
    runBtn.addEventListener("click", fetchAndRender);

    // инициируем первый запрос
    await fetchAndRender();
}

/* -----------------------
   EARTS (Анализ почвы v2)
   ----------------------- */
async function loadEarts() {
    const form = document.getElementById("soil-form");
    const inputs = {
        ph: document.getElementById("inp-ph"),
        organic: document.getElementById("inp-organic"),
        moisture: document.getElementById("inp-moisture"),
        nitrogen: document.getElementById("inp-n"),
        phosphorus: document.getElementById("inp-p"),
        potassium: document.getElementById("inp-k")
    };
    const resultBox = document.getElementById("soil-result");
    const chartCtx = document.getElementById("soil-chart").getContext("2d");
    let barChart;

    function computeScore(values) {
        // простая взвешенная формула (пример)
        // ph ideal around 6.5 -> penalty
        const ph = values.ph;
        let phScore = Math.max(0, 100 - Math.abs(6.5 - ph) * 15);

        const organicScore = Math.min(100, values.organic * 2.5); // 0-40 -> 0-100
        const moistureScore = Math.min(100, values.moisture * 2); // %
        const nScore = Math.min(100, values.n * 1.2);
        const pScore = Math.min(100, values.p * 1.2);
        const kScore = Math.min(100, values.k * 1.2);

        const total = Math.round((phScore*0.25 + organicScore*0.2 + moistureScore*0.15 + nScore*0.15 + pScore*0.12 + kScore*0.13));
        return {
            score: total,
            breakdown: { phScore: Math.round(phScore), organicScore: Math.round(organicScore), moistureScore: Math.round(moistureScore), nScore: Math.round(nScore), pScore: Math.round(pScore), kScore: Math.round(kScore) }
        };
    }

    function renderResult(values) {
        const { score, breakdown } = computeScore(values);
        let rec = "Общее состояние удовлетворительное.";
        if (score < 45) rec = "Почва бедная — рекомендовано внесение органики и азотных удобрений.";
        else if (score < 70) rec = "Средняя плодородность — добавьте органику и контроль увлажнения.";
        else rec = "Почва хорошая — минимальные вмешательства.";

        resultBox.innerHTML = `
            <div class="card">
                <h3>Итоговое значение: ${score}/100</h3>
                <p>${rec}</p>
                <ul>
                  <li>pH: ${breakdown.phScore}</li>
                  <li>Органика: ${breakdown.organicScore}</li>
                  <li>Влажность: ${breakdown.moistureScore}</li>
                  <li>N: ${breakdown.nScore}</li>
                  <li>P: ${breakdown.pScore}</li>
                  <li>K: ${breakdown.kScore}</li>
                </ul>
            </div>
        `;

        // график
        const labels = ["pH", "Органика", "Влажность", "N", "P", "K"];
        const data = [
            Math.min(100, Math.round((100 - Math.abs(6.5 - values.ph) * 15))),
            Math.min(100, Math.round(values.organic * 2.5)),
            Math.min(100, Math.round(values.moisture * 2)),
            Math.min(100, Math.round(values.n * 1.2)),
            Math.min(100, Math.round(values.p * 1.2)),
            Math.min(100, Math.round(values.k * 1.2))
        ];

        if (barChart) barChart.destroy();
        barChart = new Chart(chartCtx, {
            type: 'bar',
            data: { labels, datasets:[{ label: 'Показатели (0-100)', data }]},
            options: { responsive: true, plugins: { legend: { display: false } }, scales:{ y:{ max:100, min:0 }} }
        });
    }

    function readValues() {
        return {
            ph: parseFloat(inputs.ph.value) || 6.5,
            organic: parseFloat(inputs.organic.value) || 5,
            moisture: parseFloat(inputs.moisture.value) || 20,
            n: parseFloat(inputs.nitrogen?.value || inputs.n.value) || parseFloat(inputs.n.value) || 10,
            p: parseFloat(inputs.phosphorus?.value || inputs.p.value) || parseFloat(inputs.p.value) || 5,
            k: parseFloat(inputs.potassium?.value || inputs.k.value) || parseFloat(inputs.k.value) || 10
        };
    }

    // обновлять график при вводе
    Object.values(inputs).forEach(inp => {
        if (!inp) return;
        inp.addEventListener("input", () => renderResult(readValues()));
    });

    form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        renderResult(readValues());
    });

    // если открыт выбор района — подгружаем данные района из sessionStorage (если есть)
    const selectedDistrict = sessionStorage.getItem("selectedDistrict");
    if (selectedDistrict) {
        // если хотите можно подгрузить репрезентативные значения для района
        // здесь пример: при наличии района немного изменяем значения
        document.getElementById("district-info").innerText = `Выбран район: ${selectedDistrict}`;
    }

    // рендерим начальные значения
    renderResult(readValues());
}

/* -----------------------
   SORT (подбор сортов + случайный район подсвет)
   ----------------------- */
async function loadSort() {
    const cropSelect = document.getElementById("crop-select");
    const btn = document.getElementById("crop-run");
    const map = document.getElementById("sort-map");
    const info = document.getElementById("sort-info");

    // простая карта districts (те же id как в main)
    const districtIds = ["d1","d2","d3","d4","d5"];

    function clearHighlights() {
        districtIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.setAttribute("stroke-width", "1");
            if (el) el.setAttribute("stroke", "#666");
        });
    }

    btn.addEventListener("click", async () => {
        const crop = cropSelect.value || "пшеница";
        // запрос рекомендаций от backend (регион — Костанай)
        let result;
        try {
            result = await apiGet(`/sort?region=Костанай&crop=${encodeURIComponent(crop)}`);
        } catch (e) {
            info.innerHTML = `<div class="card">Ошибка API: ${e.message}</div>`;
            return;
        }

        // подсвечиваем случайный район
        clearHighlights();
        const rnd = districtIds[Math.floor(Math.random() * districtIds.length)];
        const el = document.getElementById(rnd);
        if (el) {
            el.setAttribute("stroke-width", "3");
            el.setAttribute("stroke", "#0b84ff");
            el.setAttribute("fill-opacity", "0.7");
        }

        info.innerHTML = `
            <div class="card">
                <b>Культура:</b> ${result.crop}<br/>
                <b>Рекомендуемый сорт:</b> ${result.recommended_variety}<br/>
                <b>Характеристики:</b> ${result.features}
            </div>
        `;
    });
}

/* -----------------------
   NASTROI (настройки)
   ----------------------- */
async function loadNastroi() {
    // Пока простая заглушка
    const el = document.getElementById("nastroi-box");
    if (el) el.innerHTML = `<div class="card">Здесь настройки приложения (язык, профиль, темы).</div>`;
}
