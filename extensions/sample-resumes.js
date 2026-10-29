'use strict';
/* ════════════════════════════════════════════════════════════════
   SAMPLE RESUMES — pure data, no logic.
   Loaded BEFORE ats-extras.js (see index.html <script> order), which
   reads this file's one global, EXT_SAMPLES, to power both the
   in-builder "Load a sample…" picker and the landing page Examples
   section/thumbnails. ats-extras.js never edits this array — it only
   reads it — so updating a sample or adding a new one only ever
   means editing THIS file.

   Original placeholder content — not copied from any real person,
   template, or site. Each entry's `data` shape matches `state.data`
   in app_1_.js exactly, so it can be dropped straight into the app.

   TO UPDATE OR REPLACE A SAMPLE: edit or replace this file only.
   Every consumer (builder picker, landing thumbnails, landing
   click-to-load) reads EXT_SAMPLES fresh — nothing else needs to
   change. Keep the shape of each entry (id, label, data.{personal,
   summary, skills, experience, projects, education, certifications,
   jd}) the same so the rest of the app keeps working.
   ════════════════════════════════════════════════════════════════ */
const EXT_SAMPLES = [
  {
    id: 'corporate',
    label: 'Corporate / Conservative (Operations)',
    data: {
      personal: { name:'Alexandra Reyes', title:'Operations Manager', email:'alexandra.reyes@email.com', phone:'+1 555 201 4478', city:'Chicago, IL', linkedin:'linkedin.com/in/alexandrareyes', portfolio:'' },
      summary: 'Operations manager with 9 years leading logistics and process-improvement teams for mid-size manufacturing firms. Reduced fulfillment cycle time 22% through workflow standardization and vendor consolidation. Known for steady, data-driven decision making and cross-departmental coordination.',
      skills: { technical: ['SAP ERP','Six Sigma','Tableau','Inventory Forecasting'], core: ['Team Leadership','Vendor Negotiation','Budget Management','Process Improvement'] },
      experience: [
        { company:'Meridian Manufacturing Co.', role:'Operations Manager', location:'Chicago, IL', start:'2019-03', end:'', current:true, description:'• Lead a 14-person operations team across two warehouse facilities.\n• Cut average fulfillment time from 4.1 to 3.2 days by standardizing intake workflows.\n• Manage a $2.1M annual logistics budget and renegotiated 3 vendor contracts, saving $180K/year.' },
        { company:'Brightline Supply Group', role:'Logistics Supervisor', location:'Naperville, IL', start:'2015-06', end:'2019-02', current:false, description:'• Supervised daily inbound/outbound shipping for a 60,000 sq ft distribution center.\n• Introduced a cycle-count program that reduced inventory discrepancies by 31%.' },
      ],
      projects: [ { name:'', role:'', tech:'', link:'', description:'' } ],
      education: [ { school:'University of Illinois at Urbana-Champaign', degree:'B.S.', field:'Supply Chain Management', location:'Urbana, IL', start:'2011-08', end:'2015-05', honors:'' } ],
      certifications: [ { name:'Six Sigma Green Belt', issuer:'ASQ', date:'2020-04', id:'' } ],
      jd: '',
    }
  },
  {
    id: 'tech',
    label: 'Tech / Skills-Forward (Software Engineer)',
    data: {
      personal: { name:'Marcus Chen', title:'Backend Software Engineer', email:'marcus.chen@email.com', phone:'+1 555 887 2201', city:'Seattle, WA', linkedin:'linkedin.com/in/marcuschen', portfolio:'github.com/mchendev' },
      summary: 'Backend engineer with 5 years building high-throughput distributed services in Python and Go. Shipped a payments-reconciliation service handling 40M+ transactions/month with 99.98% uptime. Comfortable owning a service end-to-end, from design doc to on-call.',
      skills: { technical: ['Python','Go','PostgreSQL','Kafka','Docker','Kubernetes','AWS'], core: ['System Design','Code Review','Mentorship','Incident Response'] },
      experience: [
        { company:'Fintra Systems', role:'Backend Software Engineer', location:'Seattle, WA', start:'2021-07', end:'', current:true, description:'• Built and own the payments-reconciliation service (Go, Kafka, PostgreSQL) processing 40M+ transactions/month.\n• Reduced p99 latency from 850ms to 210ms through query optimization and caching.\n• Mentor 2 junior engineers; lead the team\'s weekly design-review sessions.' },
        { company:'Northwind Analytics', role:'Software Engineer', location:'Portland, OR', start:'2019-01', end:'2021-06', current:false, description:'• Developed internal reporting APIs in Python (Flask) consumed by 6 downstream teams.\n• Migrated a monolith\'s batch-processing jobs to containerized workers, cutting runtime 40%.' },
      ],
      projects: [ { name:'ratelimiter-go', role:'Creator', tech:'Go, Redis', link:'github.com/mchendev/ratelimiter-go', description:'• Open-source sliding-window rate limiter library; 400+ GitHub stars.\n• Used internally at two employers to protect public-facing APIs.' } ],
      education: [ { school:'University of Washington', degree:'B.S.', field:'Computer Science', location:'Seattle, WA', start:'2015-09', end:'2019-06', honors:'' } ],
      certifications: [ { name:'AWS Certified Solutions Architect – Associate', issuer:'Amazon Web Services', date:'2022-11', id:'' } ],
      jd: '',
    }
  },
  {
    id: 'career-change',
    label: 'Career Change / Bridging (Teaching → Project Management)',
    data: {
      personal: { name:'Priya Patel', title:'Project Coordinator', email:'priya.patel@email.com', phone:'+1 555 340 7762', city:'Denver, CO', linkedin:'linkedin.com/in/priyapatel', portfolio:'' },
      summary: 'Former middle-school program lead transitioning into project coordination, bringing 7 years of experience planning multi-stakeholder initiatives, managing budgets, and hitting fixed deadlines under public accountability. Recently completed a Project Management certificate; seeking to apply proven organizational and stakeholder-communication skills to a corporate PM track.',
      skills: { technical: ['Asana','Microsoft Project','Google Workspace','Budget Tracking'], core: ['Stakeholder Communication','Scheduling','Cross-Functional Coordination','Problem Solving'] },
      experience: [
        { company:'Lincoln Middle School', role:'STEM Program Lead', location:'Denver, CO', start:'2017-08', end:'2024-06', current:false, description:'• Planned and ran a 120-student STEM program end-to-end, coordinating 8 staff and a $45K annual budget.\n• Delivered every program milestone on schedule across 7 consecutive school years.\n• Managed relationships with 5 external vendors and community partners.' },
        { company:'Denver Public Schools', role:'Curriculum Coordinator (part-time)', location:'Denver, CO', start:'2015-08', end:'2017-06', current:false, description:'• Coordinated curriculum rollout timelines across 4 schools, tracking milestones in a shared project tracker.' },
      ],
      projects: [ { name:'', role:'', tech:'', link:'', description:'' } ],
      education: [ { school:'University of Colorado Denver', degree:'M.Ed.', field:'Curriculum & Instruction', location:'Denver, CO', start:'2013-08', end:'2015-05', honors:'' } ],
      certifications: [ { name:'Project Management Certificate', issuer:'Google (Coursera)', date:'2024-09', id:'' } ],
      jd: '',
    }
  },
];
