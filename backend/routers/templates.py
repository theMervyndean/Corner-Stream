"""Templates router — serve downloadable Excel templates so admins/teachers upload the right format."""
from io import BytesIO
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from auth_utils import get_current_user

router = APIRouter(prefix="/templates", tags=["templates"])


def _build_workbook(sheet_name: str, headers: list[tuple[str, str]], sample_rows: list[list], notes: list[str]):
    """Build a styled .xlsx workbook with headers, sample rows and a notes section.

    headers: list of (column_name, helper_text)
    """
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="002147")  # cs-navy
    note_font = Font(italic=True, color="6B7280", size=9)
    helper_font = Font(italic=True, color="6B7280", size=9)
    center = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # Row 1: column names (headers used by the import logic)
    for ci, (name, _helper) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=ci, value=name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
    ws.row_dimensions[1].height = 26

    # Row 2: helper / required notes
    for ci, (_name, helper) in enumerate(headers, start=1):
        cell = ws.cell(row=2, column=ci, value=helper)
        cell.font = helper_font
        cell.alignment = center
    ws.row_dimensions[2].height = 32

    # Sample rows (start from row 3)
    for ri, row in enumerate(sample_rows, start=3):
        for ci, value in enumerate(row, start=1):
            ws.cell(row=ri, column=ci, value=value)

    # Auto-size columns based on column name length
    for ci, (name, _helper) in enumerate(headers, start=1):
        ws.column_dimensions[get_column_letter(ci)].width = max(16, len(name) + 4)

    # Notes section (a few rows below)
    note_start = max(len(sample_rows) + 4, 6)
    ws.cell(row=note_start, column=1, value="📝 NOTES").font = Font(bold=True, color="0056B3", size=11)
    for i, note in enumerate(notes, start=1):
        ws.cell(row=note_start + i, column=1, value=note).font = note_font

    # Freeze the header row so it stays visible while scrolling
    ws.freeze_panes = "A3"

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _xlsx_response(buf: BytesIO, filename: str):
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/students.xlsx")
async def students_template(user: dict = Depends(get_current_user)):
    """Download a pre-formatted Excel for bulk uploading students with parent info."""
    headers = [
        ("name", "Required — full name (e.g., Adaeze Okafor)"),
        ("age", "Required — number, e.g., 12"),
        ("gender", "Required — Male / Female"),
        ("class_name", "Required — must match a class in your roster (auto-added if new)"),
        ("parent_name", "Optional — parent / guardian full name"),
        ("parent_email", "Optional — used to create the Parent Portal login"),
        ("parent_phone", "Optional — WhatsApp / mobile number for notifications (e.g., +2348012345678)"),
        ("balance_due", "Optional — outstanding fees in NGN, e.g., 50000 (triggers Debt Lock)"),
    ]
    sample_rows = [
        ["Adaeze Okafor", 12, "Female", "JSS 1", "Mr. Tobi Okafor", "tobi.okafor@example.com", "+2348012345678", 0],
        ["Tunde Adesina", 13, "Male", "JSS 1", "Mrs. Kemi Adesina", "kemi.a@example.com", "+2348023456789", 25000],
        ["Chiamaka Eze", 12, "Female", "JSS 1", "Mr. Eze", "", "+2348034567890", 0],
        ["", "", "", "", "", "", "", ""],  # empty row for user to start filling
    ]
    notes = [
        "• Row 1 (headers) MUST stay exactly as shown. Don't rename columns.",
        "• Row 2 is just helper text — you can replace it with student data or leave it.",
        "• class_name must match the classes shown on your Classes tab (or it will be auto-added).",
        "• parent_email creates a Parent Portal login automatically on first upload.",
        "• balance_due in Naira (NGN) — any value > 0 locks the student until paid.",
        "• Phone numbers — use full international format like +234... for WhatsApp messaging.",
    ]
    buf = _build_workbook("Students", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-students-template.xlsx")


@router.get("/teachers.xlsx")
async def teachers_template(user: dict = Depends(get_current_user)):
    """Download a pre-formatted Excel for bulk uploading teachers."""
    headers = [
        ("name", "Required — teacher's full name"),
        ("email", "Required — login email (will receive credentials)"),
        ("password", "Required — initial password (teacher will be prompted to change)"),
        ("phone", "Optional — WhatsApp / mobile (e.g., +2348012345678)"),
        ("assigned_class", "Optional — must match a class in your roster (e.g., JSS 1 Crystal)"),
        ("subject_specialty", "Optional — main subject taught (e.g., Mathematics)"),
    ]
    sample_rows = [
        ["Mr. Akinleye Bola", "bola.akinleye@school.com", "Welcome@2026", "+2348011111111", "JSS 1", "Mathematics"],
        ["Mrs. Okonkwo Chioma", "c.okonkwo@school.com", "Welcome@2026", "+2348022222222", "SS 2", "English Language"],
        ["", "", "", "", "", ""],
    ]
    notes = [
        "• Each teacher gets a Teacher Portal login automatically.",
        "• Teachers can be assigned to multiple subjects via the Subjects tab after upload.",
        "• Phone numbers in international format (+234...) for WhatsApp messaging.",
        "• Passwords are hashed on upload — they're never stored in plain text.",
    ]
    buf = _build_workbook("Teachers", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-teachers-template.xlsx")


@router.get("/cbt-questions.xlsx")
async def cbt_questions_template(user: dict = Depends(get_current_user)):
    """Download a reference template for CBT question structure (for planning offline)."""
    headers = [
        ("question_no", "Required — sequence number, 1, 2, 3..."),
        ("type", "Required — 'mcq' or 'true_false' (T/F only for Primary/Mixed schools)"),
        ("question_text", "Required — the question itself"),
        ("option_a", "MCQ only — option A text"),
        ("option_b", "MCQ only — option B text"),
        ("option_c", "MCQ only — optional, option C text"),
        ("option_d", "MCQ only — optional, option D text"),
        ("option_e", "MCQ only — optional, option E text"),
        ("option_f", "MCQ only — optional, option F text"),
        ("correct_answer", "Required — letter A-F (for MCQ) or True/False"),
    ]
    sample_rows = [
        [1, "mcq", "What is 12 + 8?", "16", "18", "20", "22", "", "", "C"],
        [2, "mcq", "Which is a prime number?", "9", "15", "21", "23", "", "", "D"],
        [3, "true_false", "The Earth orbits the Sun.", "", "", "", "", "", "", "True"],
        [4, "mcq", "Capital of Nigeria?", "Lagos", "Abuja", "Kano", "", "", "", "B"],
    ]
    notes = [
        "• This template is a PLANNING aid — currently CBT exams are built in the Teacher dashboard, not uploaded.",
        "• Use it to draft questions offline with colleagues, then paste into the CBT builder.",
        "• true_false questions only work for Primary or Mixed schools.",
        "• MCQ supports 2–6 options (A through F). Leave unused options blank.",
        "• To attach images to questions, use the CBT builder (image upload).",
    ]
    buf = _build_workbook("CBT Questions", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-cbt-questions-template.xlsx")
