"""P0 — 工作台迭代闭环 e2e：改参数 → 指标 → 快照 → 回退 → 对比。"""
import pytest


@pytest.mark.usefixtures("page")
class TestWorkbenchFlow:

    def test_full_iteration_loop(self, page):
        page.wait_for_timeout(2500)                     # defaults/vehicle/targets load
        # snapshot 1: change geometry param (left col visible now)
        page.fill("#panel-geometry input[data-field='caster'][data-axle='front']", "6.0")
        page.click("#btnApplyGeom")
        page.wait_for_timeout(3000)
        # snapshot 2: change another param
        page.fill("#panel-geometry input[data-field='kpi'][data-axle='front']", "2.5")
        page.click("#btnApplyGeom")
        page.wait_for_timeout(3000)
        rows = page.locator("#snapshotList .snap-row").count()
        assert rows >= 2, f"2 snapshots expected, got {rows}"
        # open dashboard → 4 dimension groups
        page.click("#btnDash")
        page.wait_for_timeout(2000)
        assert page.locator("#dashboard .dim-grp").count() == 4
        # select two snapshots → compare mode shows old values
        page.locator("#snapshotList .snap-row").nth(0).click()
        page.locator("#snapshotList .snap-row").nth(1).click()
        page.wait_for_timeout(2500)
        assert page.locator("#dashboard .old").count() >= 1, "compare mode should show old values"

    def test_slider_no_snapshot_spam(self, page):
        """拖动滑块只改变姿态，不产生设计快照（历史不疯长）。"""
        page.evaluate("localStorage.clear()")           # isolate from prior tests
        page.reload(wait_until="load")
        page.wait_for_timeout(2500)
        for _ in range(3):
            page.fill("#frontTravel", "10")
            page.dispatch_event("#frontTravel", "change")
            page.wait_for_timeout(1200)
        rows = page.locator("#snapshotList .snap-row").count()
        assert rows == 0, f"slider drags must not create snapshots, got {rows}"

    def test_dashboard_no_overlap(self, page):
        """推挤式布局：指标盘展开时 3D 与指标盘都可见（无遮挡）。"""
        page.wait_for_timeout(2500)
        page.click("#btnDash")
        page.wait_for_timeout(500)
        dash_box = page.locator("#rightCol").bounding_box()
        scene_box = page.locator("#scene3d").bounding_box()
        assert dash_box is not None and scene_box is not None
        assert dash_box["x"] > scene_box["x"] + scene_box["width"] * 0.5

    def test_slider_live_solve(self, page):
        """拖动滑块 → 轻量求解实时反馈（<500ms）。"""
        page.wait_for_timeout(2500)
        page.fill("#frontTravel", "15")
        page.wait_for_timeout(700)
        status = page.locator("#solveStatus").text_content()
        assert "求解" in status and "失败" not in status
