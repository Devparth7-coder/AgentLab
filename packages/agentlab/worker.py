"""Celery integration. Independent worker processes handle long model requests."""

from celery import Celery

from agentlab.config import settings
from agentlab.executions import process_run

celery_app = Celery("agentlab", broker=settings().redis_url, backend=settings().redis_url)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=False,
    task_serializer="json",
    accept_content=["json"],
)


@celery_app.task(name="agentlab.execute_run", bind=True, max_retries=0)
def run_job(self, run_id: str):
    # Blind retrying an external agent could duplicate charges or tool effects.
    # Queue transport may redeliver, but CAS claim stops duplicate completed runs.
    process_run(run_id)
