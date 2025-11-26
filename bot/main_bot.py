import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
import aiohttp
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000")  # без слэша на конце

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN not set in .env")

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(storage=storage)

class UserStates(StatesGroup):
    waiting_for_region = State()
    waiting_for_crop = State()

def get_regions_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌾 Костанай", callback_data="region_костанай")],
        [InlineKeyboardButton(text="🏭 Рудный", callback_data="region_рудный")],
        [InlineKeyboardButton(text="🌻 Лисаковск", callback_data="region_лисаковск")],
    ])

def get_crops_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌾 Пшеница", callback_data="crop_пшеница")],
        [InlineKeyboardButton(text="🌾 Ячмень", callback_data="crop_ячмень")],
        [InlineKeyboardButton(text="🌻 Подсолнечник", callback_data="crop_подсолнечник")],
    ])

def get_main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌱 Анализ почвы", callback_data="menu_soil")],
        [InlineKeyboardButton(text="📅 Окно возможностей", callback_data="menu_window")],
        [InlineKeyboardButton(text="🎯 Подбор сорта", callback_data="menu_sort")],
        [InlineKeyboardButton(text="🌐 Открыть Mini App", web_app=WebAppInfo(url=os.getenv("FRONTEND_URL","https://YOUR-FRONTEND.vercel.app")))]
    ])

@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "🌾 Добро пожаловать в AgroSmart!\nВыберите действие:",
        reply_markup=get_main_menu()
    )

@dp.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer("Доступные команды: /start /soil /window /sort")

@dp.callback_query(F.data == "menu_soil")
async def menu_soil_handler(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("🌱 Анализ почвы — выберите регион:", reply_markup=get_regions_keyboard())
    await state.set_state(UserStates.waiting_for_region)
    await state.update_data(action="soil")
    await callback.answer()

@dp.callback_query(F.data == "menu_window")
async def menu_window_handler(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("📅 Окно возможностей — выберите регион:", reply_markup=get_regions_keyboard())
    await state.set_state(UserStates.waiting_for_region)
    await state.update_data(action="window")
    await callback.answer()

@dp.callback_query(F.data == "menu_sort")
async def menu_sort_handler(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.edit_text("🎯 Подбор сорта — выберите регион:", reply_markup=get_regions_keyboard())
    await state.set_state(UserStates.waiting_for_region)
    await state.update_data(action="sort")
    await callback.answer()

@dp.callback_query(F.data.startswith("region_"))
async def region_selected(callback: types.CallbackQuery, state: FSMContext):
    region = callback.data.split("region_")[1]
    data = await state.get_data()
    action = data.get("action")
    if action == "sort":
        await state.update_data(region=region)
        await callback.message.edit_text(f"Регион: <b>{region}</b>\nВыберите культуру:", reply_markup=get_crops_keyboard(), parse_mode="HTML")
        await state.set_state(UserStates.waiting_for_crop)
    else:
        await callback.message.edit_text("⏳ Обрабатываю...")
        try:
            async with aiohttp.ClientSession() as session:
                if action == "soil":
                    url = f"{API_BASE}/api/soil?region={region}"
                else:
                    url = f"{API_BASE}/api/window?region={region}"
                async with session.get(url, timeout=10) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        if action == "soil":
                            text = (f"🌱 Анализ почвы: {region}\n\n📊 Оценка: {result['soil_score']}/100\n{result['description']}\n\n💡 {result['recommendation']}")
                        else:
                            if result.get("favorable_days"):
                                days_text = "\n".join([f" • {d['date']} — {d['temp']}°C, ветер {d['wind']} м/с" for d in result['favorable_days']])
                                text = f"📅 Окно возможностей: {region}\n\nНайдено: {result['count']}\n{days_text}\n\n{result.get('message','')}"
                            else:
                                text = f"📅 Окно возможностей: {region}\n\n{result.get('message','Нет благоприятных дней')}"
                        await callback.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_menu")]]), parse_mode="HTML")
                    else:
                        txt = await resp.text()
                        await callback.message.edit_text(f"Ошибка API ({resp.status}): {txt}")
        except Exception as e:
            await callback.message.edit_text(f"Ошибка: {e}")
        await state.clear()
    await callback.answer()

@dp.callback_query(F.data.startswith("crop_"))
async def crop_selected(callback: types.CallbackQuery, state: FSMContext):
    crop = callback.data.split("crop_")[1]
    data = await state.get_data()
    region = data.get("region")
    await callback.message.edit_text("⏳ Подбираю сорт...")
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE}/api/sort?region={region}&crop={crop}"
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    text = (f"🎯 Подбор сорта\n📍 Регион: {region}\n🌾 Культура: {crop}\n\n✅ Рекомендуемый сорт: {result['recommended_variety']}\n📋 {result['features']}")
                    await callback.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_menu")]]))
                else:
                    txt = await resp.text()
                    await callback.message.edit_text(f"Ошибка API ({resp.status}): {txt}")
    except Exception as e:
        await callback.message.edit_text(f"Ошибка: {e}")
    await state.clear()
    await callback.answer()

@dp.callback_query(F.data == "back_to_menu")
async def back_handler(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("Главное меню:", reply_markup=get_main_menu())
    await callback.answer()

@dp.message(Command("app"))
async def cmd_app(message: Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚀 Открыть Mini App", web_app=WebAppInfo(url=os.getenv("FRONTEND_URL","https://YOUR-FRONTEND.vercel.app")))]
    ])
    await message.answer("Открываю приложение:", reply_markup=kb)

async def main():
    logger.info("Starting bot...")
    logger.info(f"API base: {API_BASE}")
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
