from agentlab import models as m
from agentlab.db import get_db
from agentlab.report_pdf import pdf_bytes
from agentlab.reports import generate
from agentlab.schemas import ListFilter, ReportIn
from agentlab.serializers import iso_utc
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, found

router = APIRouter(prefix="/reports", tags=["Immutable research reports"])


@router.get("", summary="List generated evidence reports")
def reports(
    experiment_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    q = select(m.Report)
    if experiment_id:
        q = q.where(m.Report.experiment_id == experiment_id)
    return [
        {
            "id": x.id,
            "title": x.title,
            "is_demo": bool(x.content_json.get("demo")),
            "experiment_id": x.experiment_id,
            "created_at": iso_utc(x.created_at),
        }
        for x in db.scalars(
            q.order_by(m.Report.created_at.desc()).offset(f.offset).limit(f.limit)
        ).all()
    ]


@router.post("", status_code=201, summary="Freeze a Markdown, JSON and print-ready HTML snapshot")
def create(body: ReportIn, request: Request, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, body.experiment_id)
    try:
        report = generate(db, ex)
        audit(db, request, "report.generate", "report", report.id, {"experiment_id": ex.id})
        db.commit()
        return {
            "id": report.id,
            "title": report.title,
            "is_demo": bool(report.content_json.get("demo")),
            "experiment_id": ex.id,
            "created_at": iso_utc(report.created_at),
        }
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.get("/{report_id}", summary="Read full JSON evidence snapshot and Markdown text")
def detail(report_id: str, db: Session = Depends(get_db)):
    report = found(db, m.Report, report_id)
    return {
        "id": report.id,
        "title": report.title,
        "is_demo": bool(report.content_json.get("demo")),
        "experiment_id": report.experiment_id,
        "created_at": iso_utc(report.created_at),
        "content_json": report.content_json,
        "content_markdown": report.content_markdown,
    }


@router.get(
    "/{report_id}/download", summary="Export PDF, Markdown, JSON or standalone print-ready HTML"
)
def download(report_id: str, format: str = "md", db: Session = Depends(get_db)):
    report = found(db, m.Report, report_id)
    if format == "pdf":
        return Response(
            pdf_bytes(report.content_json),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="agentlab-{report.id}.pdf"'},
        )
    if format == "md":
        return Response(
            report.content_markdown,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="agentlab-{report.id}.md"'},
        )
    if format == "html":
        return Response(
            report.content_html,
            media_type="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="agentlab-{report.id}.html"',
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
        )
    if format == "json":
        import json

        return Response(
            json.dumps(report.content_json, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="agentlab-{report.id}.json"'},
        )
    raise HTTPException(400, "Supported formats: pdf, md, json, html")
