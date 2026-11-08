"""
The live NWS snow math, checked offline with made-up forecast periods (no network calls).
"""
from datetime import datetime, timedelta, timezone

from app.services import snowModel

startOfHour = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)


def period(hoursFromNow: int, hours: int, inches: float) -> dict:
    return dict(start=(startOfHour + timedelta(hours=hoursFromNow)).isoformat(), hours=hours, inches=inches)


def test_hourly_rates_spread_each_period():
    rates = snowModel.hourlyRates([period(0, 6, 3.0), period(-14, 6, 6.0)], startOfHour)
    nowIndex = 0 - snowModel.LIVE_FIRST_HOUR
    assert (rates[nowIndex] == 0.5) and (rates[nowIndex + 5] == 0.5) and (rates[nowIndex + 6] == 0.0)
    # A period that started before the 12-hour window only counts the hours inside it
    assert (abs(sum(rates) - (3.0 + 4 * 1.0)) < 1e-9)


def test_live_blend_matches_a_single_town():
    rates = snowModel.hourlyRates([period(0, 6, 3.0)], startOfHour)
    totals = [0.0]
    for rate in rates:
        totals.append(totals[-1] + rate)
    field = dict(points=[dict(lat=42.9, lon=-78.8, rates=rates, totals=totals)], startOfHour=startOfHour, wind=dict(from_deg=0, mph=0))
    assert (snowModel.liveRate(field, 42.9, -78.8, 0) == 0.5)
    assert (abs(snowModel.liveTotal(field, 42.9, -78.8, 6) - 3.0) < 1e-9)
    assert (abs(snowModel.liveTotal(field, 42.9, -78.8, 3) - 1.5) < 1e-9)
