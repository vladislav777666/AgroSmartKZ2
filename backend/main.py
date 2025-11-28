from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import requests
import os

app = FastAPI(title="AgroSmart MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

WEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "your_api_key_here")

SOIL_DATA = {
    "костанай": {
        "score": 68,
        "description": "Средняя влагоёмкость",
        "recommendation": "Рекомендуется минимальная обработка"
    },
    "рудный": {
        "score": 72,
        "description": "Хорошая структура почвы",
        "recommendation": "Подходит для большинства культур"
    },
    "лисаковск": {
        "score": 65,
        "description": "Умеренная плодородность",
        "recommendation": "Требуется внесение удобрений"
    }
}

CROPS_DATABASE = {
    "костанай": {
        "пшеница": {
            "name": "Астана 2",
            "features": "Высокая засухоустойчивость, урожайность до 25 ц/га"
        },
        "ячмень": {
            "name": "Тургаи",
            "features": "Раннеспелый, устойчив к полеганию"
        },
        "подсолнечник": {
            "name": "КазСол",
            "features": "Масличность до 52%, засухоустойчив"
        }
    },
    "рудный": {
        "пшеница": {
            "name": "Целинная Юбилейная",
            "features": "Адаптирована к резко континентальному климату"
        },
        "ячмень": {
            "name": "Одесский 100",
            "features": "Высокая урожайность в засушливых условиях"
        }
    },
    "лисаковск": {
        "пшеница": {
            "name": "Омская 36",
            "features": "Морозостойкость и устойчивость к засухе"
        }
    }
}

REGION_COORDS = {
    "костанай": {"lat": 53.2144, "lon": 63.6246},
    "рудный": {"lat": 52.9517, "lon": 63.1142},
    "лисаковск": {"lat": 52.5369, "lon": 62.4997}
}


@app.get("/")
async def root():
    return {"status": "ok", "service": "AgroSmart API"}


@app.get("/soil")
async def get_soil(region: str):
    region = region.lower()
    if region not in SOIL_DATA:
        raise HTTPException(status_code=404, detail="Регион не найден")

    return {
        "region": region,
        "soil_score": SOIL_DATA[region]["score"],
        "description": SOIL_DATA[region]["description"],
        "recommendation": SOIL_DATA[region]["recommendation"]
    }


@app.get("/window")
async def get_window(region: str):
    region = region.lower()

    if region not in REGION_COORDS:
        raise HTTPException(status_code=404, detail="Регион не найден")

    coords = REGION_COORDS[region]

    weather = requests.get(
        "https://api.openweathermap.org/data/2.5/forecast",
        params={
            "lat": coords["lat"],
            "lon": coords["lon"],
            "appid": WEATHER_API_KEY,
            "units": "metric",
            "lang": "ru"
        }
    ).json()

    favorable = []

    for item in weather["list"]:
        temp = item["main"]["temp"]
        wind = item["wind"]["speed"]
        rain = item.get("rain", {}).get("3h", 0)
        date = item["dt_txt"].split()[0]

        if 10 <= temp <= 25 and wind < 6 and rain < 1:
            if date not in [d["date"] for d in favorable]:
                favorable.append({
                    "date": date,
                    "temp": temp,
                    "wind": wind,
                    "rain": rain
                })

    return {
        "region": region,
        "favorable_days": favorable
    }


@app.get("/sort")
async def sort(region: str, crop: str):
    region = region.lower()
    crop = crop.lower()

    if region not in CROPS_DATABASE:
        raise HTTPException(status_code=404, detail="Регион не найден")

    if crop not in CROPS_DATABASE[region]:
        raise HTTPException(status_code=404, detail="Культура не найдена")

    return CROPS_DATABASE[region][crop]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
