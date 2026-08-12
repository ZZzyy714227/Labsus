"""
P0 — E2E 滑块操作测试
模拟工程师在前端拖动/点击滑块、多滑块交替操作等场景。
"""
import pytest


def do_fill(page, selector, value):
    """填充滑块值并立即触发求解（绕过 rAF 不可靠问题）。
    先用 fill 设值（触发 input handler 同步更新显示值），
    再通过 window.__solveNow 直接调用异步求解。
    """
    page.locator(selector).fill(value)
    page.evaluate("window.__solveNow()")
    page.wait_for_timeout(500)


@pytest.mark.usefixtures("page")
class TestSliderDrag:
    """拖动滑块 → 同步显示值立即更新。"""

    def test_drag_front_positive(self, page):
        page.locator("#frontTravelSlider").fill("25")
        assert "25" in page.locator("#frontTravelVal").text_content()

    def test_drag_front_negative(self, page):
        page.locator("#frontTravelSlider").fill("-30")
        assert "-30" in page.locator("#frontTravelVal").text_content()

    def test_drag_rear(self, page):
        page.locator("#rearTravelSlider").fill("20")
        assert "20" in page.locator("#rearTravelVal").text_content()

    def test_drag_rack(self, page):
        page.locator("#rackSlider").fill("10")
        assert "10" in page.locator("#rackVal").text_content()


@pytest.mark.usefixtures("page")
class TestAngleDisplay:
    """求解完成后 → 角度/衍生信息应更新。"""

    def test_camber_updates(self, page):
        do_fill(page, "#frontTravelSlider", "15")
        assert "°" in page.locator("#camberFR").text_content()

    def test_toe_updates(self, page):
        do_fill(page, "#frontTravelSlider", "15")
        assert "°" in page.locator("#toeFR").text_content()

    def test_caster_updates(self, page):
        do_fill(page, "#frontTravelSlider", "15")
        assert "°" in page.locator("#casterFR").text_content()

    def test_derived_info_updates(self, page):
        do_fill(page, "#frontTravelSlider", "15")
        assert "mm" in page.locator("#pushRodLenFR").text_content()


@pytest.mark.usefixtures("page")
class TestSliderClick:
    """点击滑条任意位置 → 滑块跳转。"""

    def test_click_front(self, page):
        slider = page.locator("#frontTravelSlider")
        slider.fill("0")
        box = slider.bounding_box()
        if box:
            page.mouse.click(box["x"] + box["width"] * 0.75, box["y"] + box["height"] / 2)
            page.wait_for_timeout(300)
            val = float(page.locator("#frontTravelVal").text_content().replace(" mm", ""))
            assert abs(val) > 5

    def test_click_rack(self, page):
        slider = page.locator("#rackSlider")
        slider.fill("0")
        box = slider.bounding_box()
        if box:
            page.mouse.click(box["x"] + box["width"] * 0.3, box["y"] + box["height"] / 2)
            page.wait_for_timeout(300)
            val = float(page.locator("#rackVal").text_content().replace(" mm", ""))
            assert abs(val) > 1


@pytest.mark.usefixtures("page")
class TestMultiSlider:
    """多滑块交替操作 → 不卡死。"""

    def test_sequential(self, page):
        page.locator("#frontTravelSlider").fill("15")
        page.locator("#rearTravelSlider").fill("-20")
        page.locator("#rackSlider").fill("8")
        assert "15" in page.locator("#frontTravelVal").text_content()
        assert "-20" in page.locator("#rearTravelVal").text_content()
        assert "8" in page.locator("#rackVal").text_content()

    def test_rapid_changes_no_deadlock(self, page):
        f, r = page.locator("#frontTravelSlider"), page.locator("#rearTravelSlider")
        for v in ["10", "-10", "20", "-20", "5", "-5"]:
            f.fill(v)
        for v in ["15", "-15", "25", "-25"]:
            r.fill(v)
        assert "-5" in page.locator("#frontTravelVal").text_content()
        assert "-25" in page.locator("#rearTravelVal").text_content()

    def test_rack_then_front(self, page):
        """齿条操作后前轴仍可求解。"""
        rack = page.locator("#rackSlider")
        for v in ["-10", "-5", "0", "5", "10", "0"]:
            rack.fill(v)
        rack.dispatch_event("change")
        do_fill(page, "#frontTravelSlider", "15")
        assert "15" in page.locator("#frontTravelVal").text_content()
