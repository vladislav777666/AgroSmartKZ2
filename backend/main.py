from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import os
import requests
from typing import List, Dict
from auth import verify_init_data

# Load env from actual env (Render provides env var UI)
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

app = FastAPI(title="AgroSmart MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# sample data
SOIL_DATA = {
    "костанай": {"score":68, "description":"Средняя влагоёмкость", "recommendation":"Рекомендуется минимальная обработка"},
    "рудный": {"score":72, "description":"Хорошая структура почвы", "recommendation":"Подходит для большинства культур"},
    "лисаковск": {"score":65, "description":"Умеренная плодородность", "recommendation":"Требуется внесение удобрений"}
}

CROPS_DATABASE = {
    "костанай":{
        "пшеница":{"name":"Астана 2","features":"Высокая засухоустойчивость, урожайность до 25 ц/га"},
        "ячмень":{"name":"Тургаи","features":"Раннеспелый, устойчив к полеганию"},
        "подсолнечник":{"name":"КазСол","features":"Масличность до 52%, засухоустойчив"}
    },
    "рудный": {
        "пшеница":{"name":"Целинная Юбилейная","features":"Адаптирована к резко континентальному климату"},
        "ячмень":{"name":"Одесский 100","features":"Высокая урожайность в засушливых условиях"}
    },
    "лисаковск": {
        "пшеница":{"name":"Омская 36","features":"Морозостойкость и устойчивость к засухе"}
    }
}

REGION_COORDS = {
    "костанай":{"lat":53.2144,"lon":63.6246,"city":"Kostanay"},
    "рудный":{"lat":52.9517,"lon":63.1142,"city":"Rudny"},
    "лисаковск":{"lat":52.5369,"lon":62.4997,"city":"Lisakovsk"}
}

@app.get("/api/auth")
def auth(initData: str = Query(...)):
    """
    Проверка подписи initData от Telegram WebApp.
    Если подпись валидна — вернём OK.
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Server BOT_TOKEN not configured")
    if verify_init_data(initData, BOT_TOKEN):
        return {"ok": True}
    raise HTTPException(status_code=403, detail="Invalid initData signature")

@app.get("/api/health")
def health():
    return {"status":"ok","ts":datetime.utcnow().isoformat()}

@app.get("/api/soil")
def get_soil(region: str):
    region_lower = region.lower().strip()
    if region_lower not in SOIL_DATA:
        raise HTTPException(status_code=404, detail=f"Region '{region}' not found")
    d = SOIL_DATA[region_lower]
    return {"region": region, "soil_score": d["score"], "description": d["description"], "recommendation": d["recommendation"]}

@app.get("/api/window")
def get_window(region: str, days: int = 7):
    region_lower = region.lower().strip()
    if region_lower not in REGION_COORDS:
        raise HTTPException(status_code=404, detail=f"Region '{region}' not found")
    coords = REGION_COORDS[region_lower]

    if not WEATHER_API_KEY:
        # If no real API key, return mock values (works offline)
        # This prevents 500 when no key set
        mock_days = [
            {"date":"22.05.2025","temp":17,"wind":3,"rain":0},
            {"date":"23.05.2025","temp":18,"wind":4,"rain":0}
        ]
        return {"region":region,"favorable_days":mock_days,"count":len(mock_days),"message":"Mock data: set OPENWEATHER_API_KEY to get real forecast."}

    # Real request to OpenWeather
    try:
        r = requests.get("https://api.openweathermap.org/data/2.5/forecast", params={
            "lat": coords["lat"], "lon": coords["lon"], "appid": WEATHER_API_KEY, "units":"metric", "lang":"ru"
        }, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather API error: {e}")

    favorable_days = []
    processed = set()
    for item in data.get("list", []):
        date_str = item["dt_txt"].split()[0]  # YYYY-MM-DD
        if date_str in processed: continue
        temp = item["main"]["temp"]
        rain = item.get("rain", {}).get("3h", 0)
        wind = item["wind"]["speed"]
        if 10 <= temp <= 25 and rain < 1 and wind < 6:
            from datetime import datetime
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            favorable_days.append({"date":dt.strftime("%d.%m.%Y"), "temp":round(temp,1), "wind":round(wind,1), "rain":rain})
            processed.add(date_str)
        if len(favorable_days) >= 3: break

    if not favorable_days:
        return {"region":region,"favorable_days":[],"count":0,"message":"No favorable days found in the period."}

    avg_temp = round(sum(d["temp"] for d in favorable_days)/len(favorable_days),1)
    dates = ", ".join(d["date"] for d in favorable_days)
    return {"region":region,"favorable_days":favorable_days,"count":len(favorable_days),"message":f"Идеальные дни: {dates}. Средняя темп {avg_temp}°C."}

@app.get("/api/sort")
def get_sort(region: str, crop: str = "пшеница"):
    region_lower = region.lower().strip()
    crop_lower = crop.lower().strip()
    if region_lower not in CROPS_DATABASE:
        raise HTTPException(status_code=404, detail=f"Region '{region}' not found")
    rc = CROPS_DATABASE[region_lower]
    if crop_lower not in rc:
        available = ", ".join(rc.keys())
        raise HTTPException(status_code=404, detail=f"Crop '{crop}' not found in region. Available: {available}")
    info = rc[crop_lower]
    return {"region":region,"crop":crop,"recommended_variety":info["name"],"features":info["features"]}

@app.get("/api/regions")
def get_regions():
    return {"regions": list(SOIL_DATA.keys()), "count": len(SOIL_DATA)}
