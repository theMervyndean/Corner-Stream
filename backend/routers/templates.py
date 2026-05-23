"""Templates router — downloadable Excel templates with a clean Data sheet + Instructions sheet."""
from io import BytesIO
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment
from auth_utils import get_current_user

router = APIRouter(prefix="/templates", tags=["templates"])


# ------------------------------------------------------------------
# Workbook builder — single "Data" sheet (no blank/helper rows) +
# a separate "📖 Instructions" sheet so the imported data stays clean.
# ------------------------------------------------------------------
def _build_workbook(sheet_name: str, headers: list[tuple[str, str]], sample_rows: list[list], notes: list[str]):
    """headers: list of (column_name, helper_text)
    Helper_text is added as a cell *comment* on the header cell (hover-tooltip in Excel)
    so the data area never contains a "delete-this-row" stub.
    """
    wb = Workbook()
    data_ws = wb.active
    data_ws.title = sheet_name

    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="002147")
    header_align = Alignment(horizontal="left", vertical="center", wrap_text=False)
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # Row 1: column names
    for ci, (name, helper) in enumerate(headers, start=1):
        cell = data_ws.cell(row=1, column=ci, value=name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = border
        if helper:
            # Add the helper as a hover comment — invisible in the data flow
            cell.comment = Comment(helper, "Corner Streams")
    data_ws.row_dimensions[1].height = 26

    # Sample rows (start from row 2 — no helper row between)
    sample_align = Alignment(horizontal="left", vertical="center")
    sample_fill = PatternFill("solid", fgColor="F1F5F9")  # subtle slate-100 tint
    for ri, row in enumerate(sample_rows, start=2):
        for ci, value in enumerate(row, start=1):
            cell = data_ws.cell(row=ri, column=ci, value=value)
            cell.alignment = sample_align
            cell.fill = sample_fill
            cell.border = border

    # Column widths
    for ci, (name, _helper) in enumerate(headers, start=1):
        data_ws.column_dimensions[get_column_letter(ci)].width = max(18, len(name) + 6)

    # Freeze header row
    data_ws.freeze_panes = "A2"

    # Separate Instructions sheet
    notes_ws = wb.create_sheet("📖 Instructions")
    notes_ws.column_dimensions["A"].width = 110
    title = notes_ws.cell(row=1, column=1, value=f"How to fill the {sheet_name} template")
    title.font = Font(bold=True, color="002147", size=14)
    notes_ws.cell(row=2, column=1, value="Delete the sample rows on the Data sheet, then fill your own rows.").font = Font(italic=True, color="6B7280", size=10)
    for i, note in enumerate(notes, start=4):
        c = notes_ws.cell(row=i, column=1, value=note)
        c.font = Font(color="334155", size=11)
        c.alignment = Alignment(vertical="center", wrap_text=True)
        notes_ws.row_dimensions[i].height = 22

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
    headers = [
        ("name", "Required — full name (e.g., Adaeze Okafor)"),
        ("age", "Optional — number, e.g., 12"),
        ("gender", "Optional — Male / Female"),
        ("class_name", "Required — must match a class in your roster (auto-added if new)"),
        ("parent_name", "Optional — guardian's full name"),
        ("parent_email", "Optional — used to link Parent Portal login"),
        ("parent_phone", "Optional — full international format (e.g., +2348012345678)"),
        ("balance_due", "Optional — outstanding fees in NGN; values > 0 trigger Debt Lock"),
    ]
    sample_rows = [
        ["Adaeze Okafor", 12, "Female", "JSS 1", "Mr. Tobi Okafor", "tobi.okafor@example.com", "+2348012345678", 0],
        ["Tunde Adesina", 13, "Male", "JSS 1", "Mrs. Kemi Adesina", "kemi.a@example.com", "+2348023456789", 25000],
    ]
    notes = [
        "Each row creates one student record.",
        "Optionally also creates a student login (username + auto-generated password) — admin sees credentials after upload.",
        "class_name must match the classes on your Classes tab. New names are auto-added.",
        "parent_email is for linking the parent. Use the Parents template to create the parent login itself.",
        "Phone numbers in international format (+234…) for WhatsApp notifications.",
        "balance_due in Naira (NGN). Any value > 0 locks the student/parent until paid.",
    ]
    buf = _build_workbook("Students", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-students-template.xlsx")


@router.get("/parents.xlsx")
async def parents_template(user: dict = Depends(get_current_user)):
    headers = [
        ("parent_name", "Required — full name of the parent / guardian"),
        ("parent_email", "Required — used as their login email"),
        ("parent_phone", "Optional — full international format (e.g., +2348012345678)"),
        ("student_name", "Required — must match an existing student exactly"),
        ("student_class", "Required — must match the student's class (e.g., JSS 1)"),
        ("password", "Optional — leave blank to auto-generate a strong password"),
    ]
    sample_rows = [
        ["Mr. Tobi Okafor", "tobi.okafor@example.com", "+2348012345678", "Adaeze Okafor", "JSS 1", ""],
        ["Mrs. Kemi Adesina", "kemi.adesina@example.com", "+2348023456789", "Tunde Adesina", "JSS 1", ""],
    ]
    notes = [
        "Each row creates one parent login linked to one student.",
        "The student must already exist on your roster — rows pointing to unknown students are skipped (no auto-create).",
        "Class teachers can only upload parents for their assigned class. The school admin can upload for any class.",
        "Leave the password column blank — the system auto-generates a strong password and the admin sees it after upload.",
        "If the parent already exists, the student will be linked to them (no duplicate login created).",
        "The school admin is the only person who can reveal the generated credentials to share with families.",
    ]
    buf = _build_workbook("Parents", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-parents-template.xlsx")


@router.get("/teachers.xlsx")
async def teachers_template(user: dict = Depends(get_current_user)):
    headers = [
        ("name", "Required — teacher's full name"),
        ("email", "Required — login email"),
        ("password", "Optional — leave blank to auto-generate a strong password"),
        ("phone", "Optional — full international format (e.g., +2348012345678)"),
        ("assigned_class", "Optional — class to assign (e.g., JSS 1)"),
        ("subject_specialty", "Optional — main subject taught (e.g., Mathematics)"),
    ]
    sample_rows = [
        ["Mr. Akinleye Bola", "bola.akinleye@school.com", "", "+2348011111111", "JSS 1", "Mathematics"],
        ["Mrs. Okonkwo Chioma", "c.okonkwo@school.com", "", "+2348022222222", "SS 2", "English Language"],
    ]
    notes = [
        "Each row creates one teacher login.",
        "Leave the password column blank — the system auto-generates a strong password and reveals it to the admin once.",
        "assigned_class restricts a teacher to a specific roster (e.g., for parent uploads).",
        "Subjects are managed in detail later via the Subjects tab.",
        "Phone numbers in international format (+234…) for future WhatsApp notifications.",
    ]
    buf = _build_workbook("Teachers", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-teachers-template.xlsx")


@router.get("/cbt-questions.xlsx")
async def cbt_questions_template(user: dict = Depends(get_current_user)):
    headers = [
        ("question_no", "Required — sequence number, 1, 2, 3..."),
        ("type", "Required — 'mcq' or 'true_false' (T/F only for Primary/Mixed schools)"),
        ("question_text", "Required — the question itself"),
        ("option_a", "MCQ only — option A text"),
        ("option_b", "MCQ only — option B text"),
        ("option_c", "MCQ only — option C text (optional)"),
        ("option_d", "MCQ only — option D text (optional)"),
        ("option_e", "MCQ only — option E text (optional)"),
        ("option_f", "MCQ only — option F text (optional)"),
        ("correct_answer", "Required — letter A-F (for MCQ) or True/False"),
    ]
    sample_rows = [
        [1, "mcq", "What is 12 + 8?", "16", "18", "20", "22", "", "", "C"],
        [2, "mcq", "Which is a prime number?", "9", "15", "21", "23", "", "", "D"],
        [3, "true_false", "The Earth orbits the Sun.", "", "", "", "", "", "", "True"],
        [4, "mcq", "Capital of Nigeria?", "Lagos", "Abuja", "Kano", "", "", "", "B"],
    ]
    notes = [
        "This template is a PLANNING aid — currently CBT exams are built in the Teacher dashboard, not uploaded.",
        "Use it to draft questions offline with colleagues, then paste into the CBT builder.",
        "true_false questions only work for Primary or Mixed schools.",
        "MCQ supports 2–6 options (A through F). Leave unused options blank.",
        "To attach images to questions, use the CBT builder (image upload).",
    ]
    buf = _build_workbook("CBT Questions", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-cbt-questions-template.xlsx")


@router.get("/subjects.xlsx")
async def subjects_template(user: dict = Depends(get_current_user)):
    headers = [
        ("class_name", "Required — must match an existing class name exactly (case-sensitive). Example: 'JSS 1', 'Primary 4'"),
        ("subject_name", "Required — the subject name. Repeat the class_name on each row for multi-subject classes."),
    ]
    sample_rows = [
        ["JSS 1", "Mathematics"],
        ["JSS 1", "English Language"],
        ["JSS 1", "Basic Science"],
        ["Primary 4", "Mathematics"],
        ["Primary 4", "English Language"],
        ["Primary 4", "Verbal Reasoning"],
    ]
    notes = [
        "Long format: one row per (class, subject) pair. Repeat the class_name for every subject in that class.",
        "On upload, the system REPLACES the subject list for each class found in the file. Subjects for classes NOT in the file are left untouched.",
        "Class names must already exist on your school (set them under the Classes tab). Unknown classes are skipped and reported back.",
        "Subject names are de-duplicated case-insensitively within a class — 'maths' and 'Maths' count as the same row.",
        "Whitespace is trimmed; completely blank rows are ignored.",
    ]
    buf = _build_workbook("Subjects", headers, sample_rows, notes)
    return _xlsx_response(buf, "corner-streams-subjects-template.xlsx")
