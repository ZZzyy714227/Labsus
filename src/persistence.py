"""
Source file persistence — read/write config.py and main.py for permanent saves.
"""
import re
import os
import json

from config import FRAME_TUBE_COLORS, FRAME_TUBES


def _update_source_file(name, coords):
    """Write new coords for `name` back into config.py source constants."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_line = f'    "{name}": [{coords[0]:.1f}, {coords[1]:.1f}, {coords[2]:.1f}],'
    pattern = re.compile(rf'^(\s*)"{re.escape(name)}":\s*\[.*?\]')

    updated = False
    for i, line in enumerate(lines):
        if pattern.match(line):
            indent = pattern.match(line).group(1)
            comment = ''
            cmt_match = re.search(r'\](,?)\s*(#.*)$', line)
            if cmt_match:
                comma = cmt_match.group(1)
                comment = cmt_match.group(2)
                new_line = f'{indent}"{name}": [{coords[0]:.1f}, {coords[1]:.1f}, {coords[2]:.1f}]{comma}  {comment}'
            lines[i] = new_line + '\n'
            updated = True
            break

    if updated:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        return True
    return False


def _delete_tube_from_source(endpoints):
    """Remove a tube (2+ points) from FRAME_TUBES in config.py source."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Build regex patterns for multi-point tubes
    str_points = [re.escape(p) for p in endpoints]
    # Pattern for exact order
    inner = r'"\s*,\s*"'.join(str_points)
    pattern_exact = re.compile(rf'^\s*\["{inner}"\]')
    # Pattern for reversed order (2-point only)
    pattern_rev = None
    if len(endpoints) == 2:
        inner_rev = rf'"{re.escape(endpoints[1])}"\s*,\s*"{re.escape(endpoints[0])}"'
        pattern_rev = re.compile(rf'^\s*\[{inner_rev}\]')

    updated = False
    new_lines = []
    for line in lines:
        if pattern_exact.match(line) or (pattern_rev and pattern_rev.match(line)):
            updated = True
            continue
        new_lines.append(line)

    if updated:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        return True
    return False


def _update_tube_color_in_source(endpoints, color):
    """Rewrite the entire FRAME_TUBE_COLORS dict from in-memory data (in config.py)."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if not FRAME_TUBE_COLORS:
        new_block = 'FRAME_TUBE_COLORS = {}'
    else:
        parts = ['FRAME_TUBE_COLORS = {']
        for idx in sorted(FRAME_TUBE_COLORS.keys()):
            parts.append(f'    {idx}: "{FRAME_TUBE_COLORS[idx]}",')
        parts.append('}')
        new_block = '\n'.join(parts)

    marker = 'FRAME_TUBE_COLORS = {'
    start = content.index(marker)
    depth = 0
    end = start
    for i in range(start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    new_content = content[:start] + new_block + content[end:]

    if new_content != content:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False


def _add_tube_to_source(endpoints, color):
    """Append a new tube line (2+ points) to FRAME_TUBES in config.py source."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Format multi-point array: ["A", "B"] or ["A", "B", "C"]
    pts_str = ', '.join(f'"{p}"' for p in endpoints)
    new_tube_line = f'    [{pts_str}],\n'

    in_tubes = False
    new_lines = []
    inserted = False
    for line in lines:
        if 'FRAME_TUBES = [' in line:
            in_tubes = True
        if in_tubes and not inserted and line.strip() == ']':
            new_lines.append(new_tube_line)
            inserted = True
        new_lines.append(line)

    if inserted:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    return inserted


def _add_face_to_source(name, loop, color, opacity):
    """Add a face entry to BODYWORK_FACES in config.py source."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        content = f.read()

    loop_str = json.dumps(loop)
    entry = f'\n    "{name}": {{\n        "loops": [{loop_str}],\n        "color": "{color}",\n        "opacity": {opacity}\n    }},\n'
    marker = 'BODYWORK_FACES = {'
    idx = content.find(marker)
    if idx < 0:
        return False

    brace_start = content.index('{', idx)
    depth = 0
    close_idx = brace_start
    for i in range(brace_start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                close_idx = i
                break

    new_content = content[:close_idx] + entry + content[close_idx:]
    with open(src_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    return True


def _delete_face_from_source(name):
    """Remove a face from BODYWORK_FACES in config.py source."""
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    pattern = re.compile(rf'^\s*"{re.escape(name)}":\s*{{')
    in_face = False
    depth = 0
    new_lines = []
    removed = False
    for line in lines:
        if pattern.match(line):
            in_face = True
            removed = True
        if in_face:
            depth += line.count('{') - line.count('}')
            if depth <= 0:
                in_face = False
            continue
        new_lines.append(line)

    if removed:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    return removed


def _save_wing_to_source(wing_name, wing_config):
    """Rewrite the entire {wing_name} dict in config.py source.

    Args:
        wing_name: Python variable name, e.g. 'REAR_WING' or 'FRONT_WING'.
        wing_config: The dict value to serialize.
    """
    src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.py')
    with open(src_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_block = f'{wing_name} = ' + _format_py_dict(wing_config, indent=0)

    marker = f'{wing_name} = {{'
    start = content.index(marker)
    depth = 0
    end = start
    for i in range(start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    new_content = content[:start] + new_block + content[end:]

    if new_content != content:
        with open(src_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False


def _save_rear_wing_to_source(rw_config):
    """Rewrite the entire REAR_WING dict in config.py source."""
    return _save_wing_to_source('REAR_WING', rw_config)


def _save_front_wing_to_source(fw_config):
    """Rewrite the entire FRONT_WING dict in config.py source."""
    return _save_wing_to_source('FRONT_WING', fw_config)


def _save_undertray_to_source(ut_config):
    """Rewrite the entire UNDERTRAY_CONFIG dict in config.py source."""
    return _save_wing_to_source('UNDERTRAY_CONFIG', ut_config)


def _save_diffuser_to_source(df_config):
    """Rewrite the entire DIFFUSER_CONFIG dict in config.py source."""
    return _save_wing_to_source('DIFFUSER_CONFIG', df_config)


def _format_py_val(v, indent=0):
    """Format a Python value with 4-space indent, double-quoted strings."""
    sp = '    ' * indent
    sp1 = '    ' * (indent + 1)
    if isinstance(v, bool):
        return 'True' if v else 'False'
    elif isinstance(v, (int, float)):
        if isinstance(v, float):
            return f'{v:.1f}' if v == int(v) else repr(v)
        return str(v)
    elif isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    elif isinstance(v, list):
        if not v:
            return '[]'
        # Short lists on one line
        items = [_format_py_val(x, indent + 1) for x in v]
        line = ', '.join(items)
        if len(line) < 60:
            return '[' + line + ']'
        return '[\n' + sp1 + (',\n' + sp1).join(items) + '\n' + sp + ']'
    elif isinstance(v, dict):
        return _format_py_dict(v, indent)
    return repr(v)


def _format_py_dict(d, indent=0):
    """Format a dict with 4-space indent, multi-line."""
    if not d:
        return '{}'
    sp = '    ' * indent
    sp1 = '    ' * (indent + 1)
    items = []
    for k, v in d.items():
        k_str = json.dumps(k, ensure_ascii=False)
        v_str = _format_py_val(v, indent + 1)
        items.append(sp1 + k_str + ': ' + v_str)
    return '{\n' + ',\n'.join(items) + '\n' + sp + '}'
