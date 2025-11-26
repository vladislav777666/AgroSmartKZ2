import hmac
import hashlib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BOT_TOKEN = "ТОКЕН_ТВОЕГО_БОТА"

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Проверка подписи Telegram WebApp
def verify_init_data(init_data: str) -> bool:
    try:
        # Разбор строки
        params = [p for p in init_data.split("&") if "=" in p]
        data_dict = dict(p.split("=") for p in params)

        # Извлекаем hash
        received_hash = data_dict.pop("hash")

        # Строка для проверки
        sorted_params = sorted(f"{k}={v}" for k, v in data_dict.items())
        data_check_string = "\n".join(sorted_params)

        # Секретный ключ
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()

        # Считаем хеш
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(calculated_hash, received_hash)

    except Exception:
        return False


@app.get("/api/auth")
def auth(initData: str):
    """
    Проверка Telegram WebApp initData на подлинность.
    """
    if verify_init_data(initData):
        return {"status": "ok", "message": "Auth success"}
    raise HTTPException(403, "Invalid initData")


# -----------------------------
#  ТЕСТОВЫЕ ЭНДПОИНТЫ ДЛЯ MINI APP
# -----------------------------

@app.get("/api/soil")
def soil(region: str):
    return {
        "region": region,
        "soil_score": 72,
        "description": "Хорошая структура",
        "recommendation": "Подходит для большинства культур"
    }


@app.get("/api/window")
def window(region: str):
    return {
        "region": region,
        "count": 2,
        "favorable_days": [
            {"date": "22.05.2025", "temp": 17, "wind": 3},
            {"date": "23.05.2025", "temp": 18, "wind": 4}
        ]
    }


@app.get("/api/sort")
def sort(region: str, crop: str = "пшеница"):
    return {
        "region": region,
        "crop": crop,
        "recommended_variety": "Астана 2",
        "features": "Высокая урожайность"
    }


@app.get("/")
def root():
    return {"AgroSmart API": "OK"}
