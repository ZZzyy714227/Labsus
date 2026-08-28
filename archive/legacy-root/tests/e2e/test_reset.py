"""
P0 — E2E 重置功能测试
模拟工程师：操作 → 重置 → 一切恢复初始位置。
"""
import pytest


def do_solve(page):
    page.evaluate("window.__solveNow()")
    page.wait_for_timeout(500)


@pytest.mark.usefixtures("page")
class TestReset:

    def test_sliders_return_to_zero(self, page):
        page.locator("#frontTravelSlider").fill("25")
        page.locator("#rearTravelSlider").fill("-20")
        page.locator("#rackSlider").fill("10")
        page.locator("#resetBtn").click()
        do_solve(page)
        assert "0.0" in page.locator("#frontTravelVal").text_content()
        assert "0.0" in page.locator("#rearTravelVal").text_content()
        assert "0.0" in page.locator("#rackVal").text_content()

    def test_angle_display_restored(self, page):
        page.locator("#frontTravelSlider").fill("25")
        page.locator("#rackSlider").fill("8")
        page.locator("#resetBtn").click()
        do_solve(page)
        camber = page.locator("#camberFR").text_content()
        assert camber != "--"
        val = float(camber.replace("°", ""))
        assert -5 < val < 0

    def test_derived_info_restored(self, page):
        page.locator("#frontTravelSlider").fill("25")
        page.locator("#resetBtn").click()
        do_solve(page)
        assert "mm" in page.locator("#pushRodLenFR").text_content()

    def test_repeated_reset_stable(self, page):
        for i in range(3):
            page.locator("#frontTravelSlider").fill(str(10 * (i + 1)))
            page.locator("#resetBtn").click()
            do_solve(page)
        assert "0.0" in page.locator("#frontTravelVal").text_content()

    def test_reset_after_extreme_values(self, page):
        page.locator("#frontTravelSlider").fill("-40")
        page.locator("#rearTravelSlider").fill("40")
        page.locator("#rackSlider").fill("-15")
        page.locator("#resetBtn").click()
        do_solve(page)
        assert "0.0" in page.locator("#frontTravelVal").text_content()


@pytest.mark.usefixtures("page")
class TestChassisModeReset:

    def test_pose_cleared(self, page):
        page.locator("#chassisModeToggle").check()
        page.wait_for_timeout(300)
        page.locator("#heaveSlider").fill("20")
        page.locator("#pitchSlider").fill("3")
        page.locator("#rollSlider").fill("2")
        page.locator("#resetBtn").click()
        do_solve(page)
        assert "0.0" in page.locator("#heaveVal").text_content()
        assert "0.0" in page.locator("#pitchVal").text_content()
        assert "0.0" in page.locator("#rollVal").text_content()

    def test_toggle_after_reset(self, page):
        page.locator("#chassisModeToggle").check()
        page.locator("#resetBtn").click()
        do_solve(page)
        page.locator("#chassisModeToggle").uncheck()
        page.locator("#frontTravelSlider").fill("15")
        assert "15" in page.locator("#frontTravelVal").text_content()
