import logging
import threading
from collections import deque
from datetime import datetime, timezone
from typing import List, Dict, Any

class AdminLogStreamHandler(logging.Handler):
    """
    In-memory logging handler that captures console log records
    and keeps a buffer of the latest log messages for Admin UI streaming.
    """
    def __init__(self, capacity: int = 500):
        super().__init__()
        self.capacity = capacity
        self.buffer = deque(maxlen=capacity)
        self.counter = 0
        self.lock = threading.Lock()
        
        # Set standard format
        self.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            with self.lock:
                self.counter += 1
                log_entry = {
                    "id": self.counter,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": msg,
                    "raw_msg": record.getMessage()
                }
                self.buffer.append(log_entry)
        except Exception:
            self.handleError(record)

    def get_logs_after(self, after_id: int = 0) -> List[Dict[str, Any]]:
        with self.lock:
            if after_id <= 0:
                return list(self.buffer)
            return [log for log in self.buffer if log["id"] > after_id]

    def clear(self):
        with self.lock:
            self.buffer.clear()

# Global Singleton instance
admin_log_handler = AdminLogStreamHandler()

def attach_admin_log_handler():
    """Attach the admin log handler to the root logger and backend modules."""
    root_logger = logging.getLogger()
    if admin_log_handler not in root_logger.handlers:
        root_logger.addHandler(admin_log_handler)
        
    # Ensure backend loggers log at INFO level
    for name in ["backend", "backend.main", "backend.mindmap_processor", "backend.logger_handler", "backend.auth_handler", "uvicorn"]:
        lg = logging.getLogger(name)
        if admin_log_handler not in lg.handlers:
            lg.addHandler(admin_log_handler)

def get_admin_logs(after_id: int = 0) -> List[Dict[str, Any]]:
    """Retrieve logs created after the specified log ID."""
    return admin_log_handler.get_logs_after(after_id)

def push_admin_log(level: str, message: str, logger_name: str = "system"):
    """Manually push a log message into the admin log stream."""
    lg = logging.getLogger(logger_name)
    lvl = getattr(logging, level.upper(), logging.INFO)
    lg.log(lvl, message)
