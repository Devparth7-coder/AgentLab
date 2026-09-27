"""Versioned deterministic mock dataset. This is not real-world research data."""

FIXTURE_VERSION = "demo-revenue-1.0.0"
REGIONS = ("North", "South", "East", "West", "Central")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct")


def rows():
    return [
        {"region": region, "month": month, "revenue": 1000 + ri * 178 + mi * 97 + (ri * mi * 17)}
        for ri, region in enumerate(REGIONS)
        for mi, month in enumerate(MONTHS)
    ]


def revenue(region: str, month: str | None = None) -> int:
    return sum(
        row["revenue"]
        for row in rows()
        if row["region"] == region and (month is None or row["month"] == month)
    )
