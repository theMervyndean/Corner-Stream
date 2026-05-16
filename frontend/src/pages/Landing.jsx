import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import useReveal from "@/lib/useReveal";
import {
  GraduationCap, Receipt, ShieldCheck, FileBarChart, Users, QrCode,
  Mail, MessageCircle, Phone, ArrowRight, CheckCircle2, Sparkles, Lock,
  Download, FileText, BookOpenCheck, Wallet,
} from "lucide-react";
import { generateSampleReportCard, generateSampleCBT, generateSampleFinance } from "@/lib/samplePdfs";

const HERO_IMG = "https://images.unsplash.com/photo-1744809482817-9a9d4fc280af?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxhZnJpY2FuJTIwc3R1ZGVudCUyMGNsYXNzcm9vbXxlbnwwfHx8fDE3NzgzMTk1NjR8MA&ixlib=rb-4.1.0&q=85";
const TEACHER_IMG = "https://images.unsplash.com/photo-1573496527892-904f897eb744?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwyfHxhZnJpY2FuJTIwdGVhY2hlciUyMHNtaWxpbmd8ZW58MHx8fHwxNzc4MzE5NTY0fDA&ixlib=rb-4.1.0&q=85";
const PARENT_IMG = "https://images.unsplash.com/photo-1672517939771-15a3f8c49f0b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwZmF0aGVyJTIwYW5kJTIwZGF1Z2h0ZXIlMjB0YWJsZXR8ZW58MHx8fHwxNzc4MzE5NTY1fDA&ixlib=rb-4.1.0&q=85";

const PRICING = {
  cbt_essentials: { name: "CBT Essentials", desc: "Computer-based testing engine for objective exams. Local cache for unstable connections.", icon: GraduationCap, prices: { "1_term": 40000, "2_terms": 70000, "full_session": 110000 } },
  digital_reports: { name: "Digital Reports", desc: "Automated CA + Exam scoring, 5-star skills, principal e-signature, QR-verified PDFs.", icon: FileBarChart, prices: { "1_term": 50000, "2_terms": 90000, "full_session": 140000 } },
  financial_ledger: { name: "Financial Ledger", desc: "Live fee balances, Stripe + bank transfer reconciliation, instant Debt Lock on Result Checker.", icon: Receipt, prices: { "1_term": 40000, "2_terms": 70000, "full_session": 110000 } },
  unified_enterprise: { name: "Unified Enterprise", desc: "Everything in one — CBT + Reports + Ledger. Best for full-session deployments.", icon: Sparkles, prices: { "full_session": 200000 } },
};

const DURATIONS = [
  { key: "1_term", label: "1 Term" },
  { key: "2_terms", label: "2 Terms" },
  { key: "full_session", label: "Full Session" },
];

const FEATURES = [
  { icon: Users, title: "Bulk Onboarding", text: "Upload an Excel sheet — every student becomes a digital profile in seconds." },
  { icon: FileBarChart, title: "Automated Engine", text: "100-pt CA + Exam → annual averages and promotion logic, computed for you." },
  { icon: Lock, title: "Debt Lock", text: "Outstanding fees? The Result Checker stays locked until the ledger is clear." },
  { icon: QrCode, title: "QR-Verified PDFs", text: "Every result carries a unique scannable QR for authentic, tamper-proof records." },
  { icon: ShieldCheck, title: "Super Admin God Mode", text: "Centralized kill-switch, password overrides, and global lead pipeline." },
  { icon: GraduationCap, title: "Offline-First CBT", text: "Local caching for exams when networks fail — typing never stops." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [duration, setDuration] = useState("full_session");
  useReveal();

  // Skip the marketing landing when launched as an installed PWA (home-screen app)
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.startsWith("android-app://");
    if (isStandalone) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const tiers = useMemo(
    () => Object.entries(PRICING).map(([key, t]) => {
      const price = t.prices[duration];
      return { key, ...t, price };
    }),
    [duration]
  );

  const [contact, setContact] = useState({ name: "", email: "", school_name: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const submitContact = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/leads", contact);
      toast.success("Message received. Corner Streams will reach out shortly.");
      setContact({ name: "", email: "", school_name: "", phone: "", message: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="landing" />

      {/* HERO */}
      <section className="relative">
        <div className="grid-bg absolute inset-0 -z-10" />
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-10 pb-24 grid md:grid-cols-2 gap-10 items-center">
          <div className="fade-up">
            <span className="eyebrow" data-testid="hero-eyebrow">EDUCATION SAAS · NIGERIA</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight font-extrabold cs-text-navy mt-3 leading-[1.05]">
              Taking away the <span className="cs-text-green">paper trap.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base sm:text-lg text-slate-600 leading-relaxed" data-testid="hero-subtitle">
              Corner Streams is the cloud spine for Nigerian schools — bulk student onboarding, automated CA + Exam reports,
              QR-verified PDFs, and a financial ledger that actually balances. Built for principals, teachers, and parents.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                size="lg"
                className="cs-bg-green text-white hover:opacity-90 rounded-full px-7 h-12 text-base btn-anim w-full sm:w-auto"
                onClick={() => navigate("/register")}
                data-testid="hero-cta-primary"
              >
                Onboard your school <ArrowRight size={18} className="ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-2 cs-border-navy cs-text-navy hover:bg-slate-50 px-7 h-12 text-base btn-anim w-full sm:w-auto"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="hero-cta-pricing"
              >
                See pricing
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2"><CheckCircle2 size={14} className="cs-text-green" /> No paper. No queues.</div>
              <div className="flex items-center gap-2"><CheckCircle2 size={14} className="cs-text-green" /> WAEC-style grading.</div>
              <div className="flex items-center gap-2"><CheckCircle2 size={14} className="cs-text-green" /> Bank transfer + Card.</div>
            </div>
          </div>
          <div className="relative mt-8 md:mt-0">
            <div className="absolute -top-6 -left-6 w-32 h-32 cs-bg-green opacity-10 rounded-2xl rotate-6" />
            <div className="absolute -bottom-6 -right-6 w-40 h-40 cs-bg-blue opacity-10 rounded-2xl -rotate-3" />
            <img
              src={HERO_IMG}
              alt="Nigerian classroom"
              className="relative rounded-2xl shadow-xl object-cover w-full h-[260px] sm:h-[360px] md:h-[440px]"
              data-testid="hero-image"
            />
            <div className="absolute -bottom-6 left-4 sm:left-6 bg-white rounded-xl shadow-lg px-4 sm:px-5 py-3 sm:py-4 border border-slate-100">
              <div className="text-xs text-slate-500">Live in</div>
              <div className="font-display font-bold text-xl sm:text-2xl cs-text-navy">42 schools</div>
              <div className="text-xs cs-text-green">Lagos · Abuja · Port Harcourt</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-6">
          <span className="eyebrow">CORE CAPABILITIES</span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold cs-text-navy mt-2 max-w-2xl">
            Everything a Nigerian school needs to retire the file cabinet.
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="cs-card p-7" data-reveal data-reveal-delay={String((i % 3) + 1)} data-testid={`feature-card-${i}`}>
                  <div className="w-11 h-11 rounded-lg cs-bg-navy text-white flex items-center justify-center">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-display text-lg font-semibold mt-5 cs-text-navy">{f.title}</h3>
                  <p className="text-slate-600 mt-2 text-sm leading-relaxed">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SAMPLES */}
      <section id="samples" className="py-24 bg-[#F8FAFC]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-start md:items-center text-left md:text-center">
            <span className="eyebrow">SEE BEFORE YOU BUY</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold cs-text-navy mt-2 max-w-2xl">
              Sample documents — straight from the engine.
            </h2>
            <p className="text-slate-600 mt-3 max-w-2xl text-sm sm:text-base">
              Every PDF below is generated by the same Corner Streams pipeline schools use in production. Download, print, or forward to your principal.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {/* Report card */}
            <div className="cs-card p-7 flex flex-col" data-testid="sample-report-card">
              <div className="w-11 h-11 rounded-lg cs-bg-green text-white flex items-center justify-center">
                <FileBarChart size={20} />
              </div>
              <h3 className="font-display text-lg font-semibold mt-5 cs-text-navy">Term Report Card</h3>
              <p className="text-slate-600 mt-2 text-sm leading-relaxed flex-1">
                CA + Exam scores, class position, attendance, 5-star skills, principal's remark, and a QR seal for tamper-proof verification.
              </p>
              <div className="mt-5 flex items-center gap-3 text-xs text-slate-500">
                <FileText size={14} className="cs-text-green" /> 1-page PDF · 7 subjects · WAEC-style grades
              </div>
              <Button
                onClick={generateSampleReportCard}
                className="mt-6 cs-bg-navy hover:opacity-90 text-white rounded-full btn-anim"
                data-testid="sample-report-download"
              >
                <Download size={16} className="mr-2" /> Download sample
              </Button>
            </div>

            {/* CBT script */}
            <div className="cs-card p-7 flex flex-col" data-testid="sample-cbt-card">
              <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center">
                <BookOpenCheck size={20} />
              </div>
              <h3 className="font-display text-lg font-semibold mt-5 cs-text-navy">CBT Examination Script</h3>
              <p className="text-slate-600 mt-2 text-sm leading-relaxed flex-1">
                Auto-graded MCQ paper showing the candidate's answers vs. correct keys, total score, time-stamped submission, and ledger sync status.
              </p>
              <div className="mt-5 flex items-center gap-3 text-xs text-slate-500">
                <FileText size={14} className="cs-text-blue" /> Mathematics JSS 2 · 7 questions · auto-grade
              </div>
              <Button
                onClick={generateSampleCBT}
                className="mt-6 cs-bg-navy hover:opacity-90 text-white rounded-full btn-anim"
                data-testid="sample-cbt-download"
              >
                <Download size={16} className="mr-2" /> Download sample
              </Button>
            </div>

            {/* Financial statement */}
            <div className="cs-card p-7 flex flex-col" data-testid="sample-finance-card">
              <div className="w-11 h-11 rounded-lg text-white flex items-center justify-center" style={{ background: "#0F766E" }}>
                <Wallet size={20} />
              </div>
              <h3 className="font-display text-lg font-semibold mt-5 cs-text-navy">School Financial Statement</h3>
              <p className="text-slate-600 mt-2 text-sm leading-relaxed flex-1">
                Reconciled monthly ledger — Stripe + bank transfers + cash, salaries, debtors, and the net position your bursar can sign in seconds.
              </p>
              <div className="mt-5 flex items-center gap-3 text-xs text-slate-500">
                <FileText size={14} className="cs-text-green" /> Feb 2026 · 10 entries · reconciled
              </div>
              <Button
                onClick={generateSampleFinance}
                className="mt-6 cs-bg-navy hover:opacity-90 text-white rounded-full btn-anim"
                data-testid="sample-finance-download"
              >
                <Download size={16} className="mr-2" /> Download sample
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 bg-[#F8FAFC]">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex flex-col items-start md:items-center text-left md:text-center">
            <span className="eyebrow">SIMPLE NAIRA PRICING</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold cs-text-navy mt-2">
              Pick the duration. We'll do the math.
            </h2>
            <p className="text-slate-600 mt-3 max-w-2xl">
              Plans renew per academic block. Pay by Stripe card or upload a Nigerian bank transfer slip — Super Admin verifies in hours.
            </p>
            <div className="mt-8 pill-toggle" data-testid="pricing-toggle">
              {DURATIONS.map((d) => (
                <button
                  key={d.key}
                  className={duration === d.key ? "active" : ""}
                  onClick={() => setDuration(d.key)}
                  data-testid={`pricing-toggle-${d.key}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((t, idx) => {
              const Icon = t.icon;
              const featured = t.key === "unified_enterprise";
              const available = t.price !== undefined;
              return (
                <div
                  key={t.key}
                  className={`cs-card p-7 flex flex-col ${featured ? "tier-featured" : ""}`}
                  data-reveal
                  data-reveal-delay={String((idx % 4) + 1)}
                  data-testid={`pricing-card-${t.key}`}
                >
                  <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-display text-xl font-bold mt-5 cs-text-navy">{t.name}</h3>
                  <p className="text-sm text-slate-600 mt-2 min-h-[60px]">{t.desc}</p>
                  <div className="mt-6">
                    {available ? (
                      <>
                        <div className="font-display text-4xl font-extrabold cs-text-navy">
                          ₦{t.price.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          per school · {DURATIONS.find((d) => d.key === duration)?.label}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-400 italic">Available on Full Session only</div>
                    )}
                  </div>
                  <Button
                    className={`mt-6 rounded-full btn-anim ${featured ? "cs-bg-green hover:opacity-90 text-white" : "cs-bg-navy hover:opacity-90 text-white"}`}
                    disabled={!available}
                    onClick={() => navigate(`/register?tier=${t.key}&duration=${duration}`)}
                    data-testid={`pricing-cta-${t.key}`}
                  >
                    {available ? "Choose plan" : "Not available"}
                  </Button>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* TESTIMONIALS / SHOWCASE */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-6 grid md:grid-cols-3 gap-6" data-reveal>
          <div className="cs-card overflow-hidden md:col-span-2 row-span-2">
            <img src={TEACHER_IMG} alt="Teacher" className="w-full h-72 object-cover" />
            <div className="p-8">
              <span className="eyebrow">FROM THE STAFF ROOM</span>
              <p className="font-display text-2xl cs-text-navy mt-3 leading-snug">
                "I used to spend my Saturdays computing CA scores. Now I tap the keys and Corner Streams hands me the report card."
              </p>
              <div className="mt-4 text-sm text-slate-500">— Mr. Bayo Adeyemi, JSS Mathematics, Lagos</div>
            </div>
          </div>
          <div className="cs-card p-7">
            <div className="eyebrow">PRINCIPALS</div>
            <p className="cs-text-navy font-display text-lg mt-3 leading-snug">
              "The kill-switch is brilliant. I sleep better knowing fees can't be bypassed."
            </p>
            <div className="text-sm text-slate-500 mt-3">— Mrs. Okonkwo, Sunrise Academy</div>
          </div>
          <div className="cs-card p-7">
            <div className="flex items-center gap-3">
              <img src={PARENT_IMG} alt="Parent" className="w-14 h-14 rounded-full object-cover" />
              <div>
                <div className="font-semibold cs-text-navy">Parent Portal</div>
                <div className="text-xs text-slate-500">Real-time access</div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-4 leading-relaxed">
              Parents check term reports on their phone, see fee balance, and download QR-verified PDFs.
            </p>
          </div>
        </div>
      </section>

      {/* ABOUT US */}
      <section id="about" className="py-24 bg-[#F8FAFC]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 grid md:grid-cols-5 gap-10 items-center">
          <div className="md:col-span-2 relative">
            <div className="absolute -top-4 -left-4 w-28 h-28 cs-bg-green opacity-10 rounded-2xl rotate-6" />
            <div className="absolute -bottom-4 -right-4 w-32 h-32 cs-bg-blue opacity-10 rounded-2xl -rotate-3" />
            <div className="relative cs-card p-6 text-center overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_digital-results-6/artifacts/q6174sf8_1000384115%20-%20Copyy.png"
                alt="Mervydean Hilary — Founder, Corner Streams"
                className="w-full h-72 sm:h-80 rounded-xl object-cover object-top"
                data-testid="founder-photo"
              />
              <div className="mt-5 font-display font-bold text-xl cs-text-navy">Mervydean Hilary</div>
              <div className="text-xs text-slate-500 mt-1">Founder · Corner Streams</div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full cs-bg-green text-white">
                6 years in the classroom
              </div>
            </div>
          </div>

          <div className="md:col-span-3">
            <span className="eyebrow" data-testid="about-eyebrow">OUR STORY</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold cs-text-navy mt-2 leading-tight">
              Born in a classroom. <span className="cs-text-green">Built to close the loops.</span>
            </h2>
            <p className="text-slate-600 mt-6 leading-relaxed text-base">
              After six years in the classroom, our founder, <strong className="cs-text-navy">Mervydean Hilary</strong>, saw what others missed: a series of operational "loops" that drain school efficiency and stall student progress.
            </p>
            <p className="text-slate-600 mt-4 leading-relaxed text-base">
              Corner Streams was born from a desire to close those loops. We are an initiative dedicated to empowering schools with the <strong className="cs-text-navy">data integrity</strong> and <strong className="cs-text-navy">digital infrastructure</strong> required to compete on a global stage.
            </p>
            <p className="text-slate-600 mt-4 leading-relaxed text-base">
              We turn local educational challenges into streamlined, world-class success stories.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="cs-card p-4 text-center">
                <div className="font-display font-extrabold text-2xl cs-text-green">6+</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Years in class</div>
              </div>
              <div className="cs-card p-4 text-center">
                <div className="font-display font-extrabold text-2xl cs-text-blue">42</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Schools live</div>
              </div>
              <div className="cs-card p-4 text-center">
                <div className="font-display font-extrabold text-2xl cs-text-navy">∞</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Loops closed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-24 cs-bg-navy text-white">
        <div className="max-w-[1400px] mx-auto px-6 grid md:grid-cols-2 gap-12">
          <div>
            <span className="eyebrow text-white/70">CONTACT US</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2">Tell us about your school.</h2>
            <p className="mt-4 text-white/70 max-w-md">
              We onboard new schools every week. Drop your details and we will route your inquiry to the right Corner Streams advisor.
            </p>
            <div className="mt-10 space-y-4 text-sm">
              <div className="flex items-center gap-3"><Mail size={16} className="cs-text-green" /> <span>thecornerstreams@gmail.com</span></div>
              <div className="flex items-center gap-3"><MessageCircle size={16} className="cs-text-green" /> <span>WhatsApp: +234 902 144 5607</span></div>
              <div className="flex items-center gap-3"><Phone size={16} className="cs-text-green" /> <span>Mon – Fri, 09:00 – 18:00 WAT</span></div>
            </div>
          </div>
          <form onSubmit={submitContact} className="bg-white text-slate-900 rounded-2xl p-7 space-y-4" data-testid="contact-form">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label htmlFor="cname">Your name</Label><Input id="cname" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} data-testid="contact-name" /></div>
              <div><Label htmlFor="cemail">Email</Label><Input id="cemail" type="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} data-testid="contact-email" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label htmlFor="cschool">School name</Label><Input id="cschool" value={contact.school_name} onChange={(e) => setContact({ ...contact, school_name: e.target.value })} data-testid="contact-school" /></div>
              <div><Label htmlFor="cphone">Phone / WhatsApp</Label><Input id="cphone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} data-testid="contact-phone" /></div>
            </div>
            <div><Label htmlFor="cmsg">Message</Label><Textarea id="cmsg" rows={4} required value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} data-testid="contact-message" /></div>
            <Button type="submit" disabled={submitting} className="cs-bg-green hover:opacity-90 rounded-full text-white w-full h-11" data-testid="contact-submit">
              {submitting ? "Sending…" : "Send inquiry"}
            </Button>
          </form>
        </div>
      </section>

      <footer className="cs-bg-navy text-white/70 text-xs py-6 border-t border-white/10">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} Corner Streams · Taking away the paper trap.</div>
          <div className="flex items-center gap-5">
            <a href="mailto:thecornerstreams@gmail.com" className="hover:text-white">thecornerstreams@gmail.com</a>
            <a href="https://wa.me/2349021445607" target="_blank" rel="noreferrer" className="hover:text-white">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
