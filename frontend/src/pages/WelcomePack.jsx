import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo.jsx";
import { Printer, ArrowLeft } from "lucide-react";

export default function WelcomePack() {
  const [school, setSchool] = useState(null);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get("/schools/me"), api.get("/users"), api.get("/students")])
      .then(([s, u, st]) => {
        setSchool(s.data.school);
        setUsers(u.data.users || []);
        setStudents(st.data.students || []);
      })
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
  }, []);

  if (!school) return <div className="p-10 text-slate-500">Preparing welcome pack…</div>;

  const teachers = users.filter((u) => u.role === "teacher");
  const parents = users.filter((u) => u.role === "parent");
  const studentLogins = users.filter((u) => u.role === "student");

  return (
    <div className="min-h-screen bg-slate-100 py-10 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-6 mb-4 flex items-center justify-between no-print">
        <Button variant="outline" onClick={() => navigate("/dashboard/school")} className="rounded-full btn-anim"><ArrowLeft size={14} className="mr-2" /> Back</Button>
        <div className="text-xs text-slate-500">Term opening · onboarding pack</div>
        <Button onClick={() => window.print()} className="cs-bg-navy text-white hover:opacity-90 rounded-full btn-anim" data-testid="welcome-print"><Printer size={14} className="mr-2" /> Print pack</Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow rounded-lg p-10 print:shadow-none print:rounded-none">
        {/* Cover */}
        <div className="text-center pb-8 border-b">
          {school.logo_url ? <img src={school.logo_url} alt="" className="w-24 h-24 mx-auto object-contain" /> : <Logo size={64} withText={false} />}
          <h1 className="font-display text-4xl font-extrabold cs-text-navy mt-4">{school.name}</h1>
          {school.motto && <div className="font-script text-2xl cs-text-blue mt-2">"{school.motto}"</div>}
          <div className="text-sm text-slate-500 mt-3">{school.address}</div>
          <div className="text-sm text-slate-500">{school.phone} · {school.email}</div>
          <div className="mt-6 inline-block px-6 py-2 cs-bg-green text-white rounded-full text-sm font-bold">Welcome Pack · {new Date().getFullYear()} academic year</div>
        </div>

        {/* Teachers */}
        <section className="mt-8 break-inside-avoid">
          <h2 className="font-display text-xl font-bold cs-text-navy">Teaching staff ({teachers.length})</h2>
          <p className="text-xs text-slate-500 mt-1">Each teacher signs in at <strong>cornerstreams.com/login</strong> using these credentials. Change password on first login.</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {teachers.map((t) => (
              <div key={t.id} className="border rounded p-4">
                <div className="font-semibold cs-text-navy">{t.name}</div>
                <div className="text-xs text-slate-500">{t.assigned_class || "—"}</div>
                <div className="mt-2 text-xs"><span className="text-slate-400">Email:</span> <span className="font-mono">{t.email}</span></div>
              </div>
            ))}
            {!teachers.length && <div className="text-sm text-slate-400 col-span-2">No teachers added yet. Use the Users tab in your dashboard to create teacher logins.</div>}
          </div>
        </section>

        {/* Parents */}
        <section className="mt-8 break-inside-avoid">
          <h2 className="font-display text-xl font-bold cs-text-navy">Parent portal access ({parents.length})</h2>
          <p className="text-xs text-slate-500 mt-1">Parents sign in at the main site to view results, fee balances, and the QR-verified PDF.</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {parents.map((p) => (
              <div key={p.id} className="border rounded p-4">
                <div className="font-semibold cs-text-navy">{p.name}</div>
                <div className="text-xs"><span className="text-slate-400">Email:</span> <span className="font-mono">{p.email}</span></div>
              </div>
            ))}
            {!parents.length && <div className="text-sm text-slate-400 col-span-2">No parent accounts yet.</div>}
          </div>
        </section>

        {/* Student login slips */}
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold cs-text-navy">Student login slips ({studentLogins.length})</h2>
          <p className="text-xs text-slate-500 mt-1">Tear off and hand to each student. They sign in to take CBT exams and check term results.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {studentLogins.map((s) => {
              const stu = students.find((x) => x.id === s.student_id);
              return (
                <div key={s.id} className="border-2 border-dashed rounded p-4 break-inside-avoid">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Corner Streams · Student login</div>
                  <div className="font-semibold cs-text-navy mt-1">{s.name}</div>
                  <div className="text-xs text-slate-500">{stu?.class_name || ""}</div>
                  <div className="mt-2 text-xs"><span className="text-slate-400">Email:</span> <span className="font-mono">{s.email}</span></div>
                  <div className="text-xs"><span className="text-slate-400">Sign in at:</span> <span className="font-mono">cornerstreams.com/login</span></div>
                </div>
              );
            })}
            {!studentLogins.length && <div className="text-sm text-slate-400 col-span-2">No student logins provisioned yet. Use the <em>Create login</em> button on each student row.</div>}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t text-center text-xs text-slate-500">
          Powered by Corner Streams · Taking away the paper trap. · Support: thecornerstreams@gmail.com
        </div>
      </div>
    </div>
  );
}
