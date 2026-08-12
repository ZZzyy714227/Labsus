"""
P0 — E2E 综合交互流程测试
模拟真实工程师操作：轮跳 → 转向 → 观察角度 → 重置完整流程。
"""
import pytest


def do_solve(page):
    """通过测试钩子直接触发求解，等待完成。"""
    page.evaluate("window.__solveNow()")
    page.wait_for_timeout(500)


def do_fill(page, selector, value):
    """填充滑块值并触发求解。"""
    page.locator(selector).fill(value)
    do_solve(page)


@pytest.mark.usefixtures("page")
class TestEngineerWorkflow:

    def test_bump_then_steer_then_angles(self, page):
        do_fill(page, "#frontTravelSlider", "15")
        do_fill(page, "#rearTravelSlider", "10")
        do_fill(page, "#rackSlider", "8")
        camber = page.locator("#camberFR").text_content()
        assert "°" in camber
        assert float(camber.replace("°", "")) < 0

    def test_steering_changes_toe(self, page):
        do_solve(page)
        toe0 = page.locator("#toeFR").text_content()
        do_fill(page, "#rackSlider", "12")
        toe1 = page.locator("#toeFR").text_content()
        assert toe0 != toe1, f"齿条位移未改变前束: {toe0} → {toe1}"

    def test_symmetric_operation(self, page):
        do_fill(page, "#frontTravelSlider", "20")
        fr = float(page.locator("#camberFR").text_content().replace("°", ""))
        fl = float(page.locator("#camberFL").text_content().replace("°", ""))
        assert fr < 0 and fl > 0
        assert abs(fr + fl) < 1.5

    def test_front_rear_independent(self, page):
        do_solve(page)
        initial = page.locator("#toeFR").text_content()
        do_fill(page, "#rearTravelSlider", "20")
        assert page.locator("#toeFR").text_content() == initial

    def test_steering_affects_only_front(self, page):
        do_solve(page)
        rear0 = page.locator("#toeRR").text_content()
        do_fill(page, "#rackSlider", "12")
        assert page.locator("#toeRR").text_content() == rear0


@pytest.mark.usefixtures("page")
class TestSliderSmoothness:

    def test_front_after_rack(self, page):
        page.locator("#rackSlider").fill("10")
        page.locator("#frontTravelSlider").fill("15")
        assert "15" in page.locator("#frontTravelVal").text_content()

    def test_rear_after_front(self, page):
        page.locator("#frontTravelSlider").fill("20")
        page.locator("#rearTravelSlider").fill("-25")
        assert "-25" in page.locator("#rearTravelVal").text_content()

    def test_all_independent(self, page):
        page.locator("#frontTravelSlider").fill("15")
        page.locator("#rearTravelSlider").fill("-10")
        page.locator("#rackSlider").fill("5")
        assert "15" in page.locator("#frontTravelVal").text_content()
        assert "-10" in page.locator("#rearTravelVal").text_content()
        assert "5" in page.locator("#rackVal").text_content()


@pytest.mark.usefixtures("page")
class TestFullCycle:

    def test_two_cycles(self, page):
        page.locator("#frontTravelSlider").fill("25")
        page.locator("#rearTravelSlider").fill("-15")
        page.locator("#rackSlider").fill("8")
        page.locator("#resetBtn").click()
        do_solve(page)
        s1 = page.locator("#frontTravelVal").text_content()

        page.locator("#frontTravelSlider").fill("-30")
        page.locator("#rearTravelSlider").fill("20")
        page.locator("#rackSlider").fill("-10")
        page.locator("#resetBtn").click()
        do_solve(page)
        s2 = page.locator("#frontTravelVal").text_content()
        assert s1 == s2
