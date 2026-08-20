"""JSON 版本化存储（设计文档 §11.1）。

结构：
    data/store/chassis_designs/{design_id}.json   # {design_id, versions[], latest}
    data/store/analysis_cases/{case_id}.json      # {case_id, versions[], latest}
    data/store/analysis_results/{result_id}.json  # 单个不可变结果

V1 不引入 SQLite；写入用临时文件 + os.replace 保证原子性。
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from core.models import AnalysisCase, AnalysisResult, CaseVersion, ChassisDesign, DesignVersion

DEFAULT_ROOT = Path(__file__).resolve().parents[2] / "data" / "store"

_DESIGNS = "chassis_designs"
_CASES = "analysis_cases"
_RESULTS = "analysis_results"


class DataStore:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root is not None else DEFAULT_ROOT
        for sub in (_DESIGNS, _CASES, _RESULTS):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    # -- io helpers -------------------------------------------------
    def _write_json(self, path: Path, payload: dict) -> None:
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)

    def _read_json(self, path: Path) -> dict | None:
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    # -- designs ----------------------------------------------------
    def _design_path(self, design_id: str) -> Path:
        return self.root / _DESIGNS / f"{design_id}.json"

    def create_design(self, first_version: DesignVersion,
                      design_id: str) -> ChassisDesign:
        if self._design_path(design_id).exists():
            raise ValueError(f"design '{design_id}' already exists")
        first_version.version = 1
        doc = ChassisDesign(design_id=design_id, versions=[first_version], latest=1)
        self._write_json(self._design_path(design_id), doc.model_dump())
        return doc

    def _load_design(self, design_id: str) -> ChassisDesign:
        raw = self._read_json(self._design_path(design_id))
        if raw is None:
            raise KeyError(f"design '{design_id}' not found")
        return ChassisDesign.model_validate(raw)

    def get_design(self, design_id: str, version: int | None = None) -> DesignVersion:
        doc = self._load_design(design_id)
        want = doc.latest if version is None else version
        for dv in doc.versions:
            if dv.version == want:
                return dv
        raise KeyError(f"design '{design_id}' has no version {want}")

    def add_design_version(self, design_id: str,
                           version: DesignVersion) -> DesignVersion:
        doc = self._load_design(design_id)
        version.version = doc.latest + 1
        doc.versions.append(version)
        doc.latest = version.version
        self._write_json(self._design_path(design_id), doc.model_dump())
        return version

    def list_designs(self) -> list[dict]:
        out = []
        for p in sorted((self.root / _DESIGNS).glob("*.json")):
            raw = self._read_json(p)
            if raw:
                latest: dict = next((v for v in raw["versions"]
                                     if v["version"] == raw["latest"]), {})
                out.append({"design_id": raw["design_id"], "latest": raw["latest"],
                            "name": latest.get("name", "")})
        return out

    # -- cases ------------------------------------------------------
    def _case_path(self, case_id: str) -> Path:
        return self.root / _CASES / f"{case_id}.json"

    def create_case(self, first_version: CaseVersion, case_id: str) -> AnalysisCase:
        if self._case_path(case_id).exists():
            raise ValueError(f"case '{case_id}' already exists")
        first_version.version = 1
        doc = AnalysisCase(case_id=case_id, versions=[first_version], latest=1)
        self._write_json(self._case_path(case_id), doc.model_dump())
        return doc

    def _load_case(self, case_id: str) -> AnalysisCase:
        raw = self._read_json(self._case_path(case_id))
        if raw is None:
            raise KeyError(f"case '{case_id}' not found")
        return AnalysisCase.model_validate(raw)

    def get_case(self, case_id: str, version: int | None = None) -> CaseVersion:
        doc = self._load_case(case_id)
        want = doc.latest if version is None else version
        for cv in doc.versions:
            if cv.version == want:
                return cv
        raise KeyError(f"case '{case_id}' has no version {want}")

    def list_cases(self) -> list[dict]:
        out = []
        for p in sorted((self.root / _CASES).glob("*.json")):
            raw = self._read_json(p)
            if raw:
                latest: dict = next((v for v in raw["versions"]
                                     if v["version"] == raw["latest"]), {})
                out.append({"case_id": raw["case_id"], "latest": raw["latest"],
                            "name": latest.get("name", "")})
        return out

    # -- results ----------------------------------------------------
    def save_result(self, result: AnalysisResult) -> AnalysisResult:
        path = self.root / _RESULTS / f"{result.result_id}.json"
        if path.exists():
            raise ValueError(f"result '{result.result_id}' already exists")
        self._write_json(path, result.model_dump())
        return result

    def list_results(self, design_id: str | None = None,
                     case_id: str | None = None) -> list[dict]:
        out = []
        for p in sorted((self.root / _RESULTS).glob("*.json")):
            raw = self._read_json(p)
            if not raw:
                continue
            if design_id is not None and raw["design_id"] != design_id:
                continue
            if case_id is not None and raw["case_id"] != case_id:
                continue
            out.append(raw)
        return out
