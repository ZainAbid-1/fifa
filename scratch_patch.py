import re

with open("api.py", "r", encoding="utf-8") as f:
    content = f.read()

# Fix simulate_stage
def replace_simulate_stage(match):
    body = match.group(0)
    body = body.replace('def simulate_stage():', 'def simulate_stage(x_session_id: str = Header("default")):\n    session = get_session(x_session_id)')
    body = body.replace('single_tournament', 'session["tournament"]')
    body = body.replace('app_state["computed_ratings"]', 'session["computed_ratings"]')
    return body

# Match from def simulate_stage(): to the return dict
content = re.sub(r'def simulate_stage\(\):.*?(?=\n# ── 4\.|@app)', replace_simulate_stage, content, flags=re.DOTALL)

# Fix get_group_fixtures
def replace_group_fixtures(match):
    body = match.group(0)
    body = body.replace('def get_group_fixtures():', 'def get_group_fixtures(x_session_id: str = Header("default")):\n    session = get_session(x_session_id)')
    body = body.replace('single_tournament', 'session["tournament"]')
    return body

content = re.sub(r'def get_group_fixtures\(\):.*?(?=@app|\Z)', replace_group_fixtures, content, flags=re.DOTALL)

with open("api.py", "w", encoding="utf-8") as f:
    f.write(content)
