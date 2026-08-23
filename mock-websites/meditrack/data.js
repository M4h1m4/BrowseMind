/* ============================================================
   MediTrack — Global Mock Data
   All data is stored in the global MEDITRACK object
   ============================================================ */

var MEDITRACK = (function () {

  // ── PATIENTS ─────────────────────────────────────────────
  var patients = [
    {
      id: 'P001', name: 'Margaret L. Thornton', dob: '1958-03-12', gender: 'Female',
      phone: '(617) 555-0143', email: 'margaret.thornton@email.com',
      bloodType: 'A+', address: '14 Birchwood Drive, Boston, MA 02108',
      conditions: ['Hypertension', 'Type 2 Diabetes'],
      allergies: ['Penicillin', 'Sulfa drugs'],
      insurance: 'BlueCross BlueShield', emergencyContact: 'Robert Thornton (617) 555-0144'
    },
    {
      id: 'P002', name: 'James R. Calloway', dob: '1972-07-24', gender: 'Male',
      phone: '(617) 555-0287', email: 'jcalloway72@webmail.com',
      bloodType: 'O+', address: '88 Maple Street, Cambridge, MA 02139',
      conditions: ['Asthma', 'Seasonal Allergies'],
      allergies: ['Aspirin', 'Latex'],
      insurance: 'Aetna', emergencyContact: 'Linda Calloway (617) 555-0288'
    },
    {
      id: 'P003', name: 'Dorothy E. Nakamura', dob: '1965-11-03', gender: 'Female',
      phone: '(781) 555-0311', email: 'd.nakamura@mailbox.net',
      bloodType: 'B+', address: '220 Oak Avenue, Somerville, MA 02143',
      conditions: ['Rheumatoid Arthritis', 'Osteoporosis'],
      allergies: ['Codeine'],
      insurance: 'United Healthcare', emergencyContact: 'Tom Nakamura (781) 555-0312'
    },
    {
      id: 'P004', name: 'Samuel D. Okafor', dob: '1989-04-17', gender: 'Male',
      phone: '(617) 555-0419', email: 'samuel.okafor@techmail.io',
      bloodType: 'A-', address: '5 Fenway Circle, Boston, MA 02115',
      conditions: ['Hyperlipidemia'],
      allergies: ['None known'],
      insurance: 'Cigna', emergencyContact: 'Adaeze Okafor (617) 555-0420'
    },
    {
      id: 'P005', name: 'Helen C. Vasquez', dob: '1943-09-28', gender: 'Female',
      phone: '(508) 555-0512', email: 'helen.vasquez@seniornet.org',
      bloodType: 'AB+', address: '301 Elm Street, Worcester, MA 01601',
      conditions: ['Congestive Heart Failure', 'Atrial Fibrillation', 'Type 2 Diabetes'],
      allergies: ['Ibuprofen', 'Contrast dye'],
      insurance: 'Medicare', emergencyContact: 'Carlos Vasquez (508) 555-0513'
    },
    {
      id: 'P006', name: 'Kevin P. Murakami', dob: '1981-02-14', gender: 'Male',
      phone: '(617) 555-0618', email: 'kevin.murakami@inbox.com',
      bloodType: 'O-', address: '72 Queensberry St, Boston, MA 02215',
      conditions: ['Migraine', 'Anxiety Disorder'],
      allergies: ['Sulfa drugs', 'Morphine'],
      insurance: 'Harvard Pilgrim', emergencyContact: 'Sara Murakami (617) 555-0619'
    },
    {
      id: 'P007', name: 'Patricia A. Delacroix', dob: '1955-06-09', gender: 'Female',
      phone: '(781) 555-0721', email: 'p.delacroix@homemail.net',
      bloodType: 'B-', address: '18 Harbor View Rd, Quincy, MA 02169',
      conditions: ['Hypothyroidism', 'Hypertension'],
      allergies: ['Penicillin'],
      insurance: 'Tufts Health Plan', emergencyContact: 'Marc Delacroix (781) 555-0722'
    },
    {
      id: 'P008', name: 'Anthony B. Ruiz', dob: '1993-12-01', gender: 'Male',
      phone: '(617) 555-0834', email: 'anthony.ruiz93@fastmail.com',
      bloodType: 'A+', address: '404 Tremont Street, Boston, MA 02116',
      conditions: ['GERD', 'Obesity'],
      allergies: ['None known'],
      insurance: 'Cigna', emergencyContact: 'Maria Ruiz (617) 555-0835'
    },
    {
      id: 'P009', name: 'Barbara G. Whitfield', dob: '1948-01-22', gender: 'Female',
      phone: '(978) 555-0915', email: 'bwhitfield@retiredemail.com',
      bloodType: 'O+', address: '55 Granite Street, Lowell, MA 01852',
      conditions: ['Chronic Kidney Disease Stage 3', 'Hypertension', 'Anemia'],
      allergies: ['ACE Inhibitors', 'NSAIDs'],
      insurance: 'Medicare', emergencyContact: 'Harold Whitfield (978) 555-0916'
    },
    {
      id: 'P010', name: 'Christopher N. Ellis', dob: '1977-08-30', gender: 'Male',
      phone: '(617) 555-1003', email: 'chris.ellis@workemail.com',
      bloodType: 'AB-', address: '11 Hanover Street, Boston, MA 02113',
      conditions: ['Type 1 Diabetes', 'Peripheral Neuropathy'],
      allergies: ['Sulfa drugs'],
      insurance: 'BlueCross BlueShield', emergencyContact: 'Wendy Ellis (617) 555-1004'
    },
    {
      id: 'P011', name: 'Susan M. Patel', dob: '1969-05-15', gender: 'Female',
      phone: '(617) 555-1112', email: 'susan.patel@mailnet.com',
      bloodType: 'A+', address: '230 Commonwealth Ave, Boston, MA 02116',
      conditions: ['Lupus', 'Fibromyalgia'],
      allergies: ['Aspirin', 'Penicillin', 'Latex'],
      insurance: 'United Healthcare', emergencyContact: 'Raj Patel (617) 555-1113'
    },
    {
      id: 'P012', name: 'Robert T. Greenwald', dob: '1985-10-08', gender: 'Male',
      phone: '(617) 555-1224', email: 'rob.greenwald@email.net',
      bloodType: 'B+', address: '9 Washington Street, Newton, MA 02458',
      conditions: ['Depression', 'Insomnia'],
      allergies: ['None known'],
      insurance: 'Aetna', emergencyContact: 'Claire Greenwald (617) 555-1225'
    },
    {
      id: 'P013', name: 'Linda F. Beaumont', dob: '1960-03-27', gender: 'Female',
      phone: '(508) 555-1337', email: 'l.beaumont@familymail.org',
      bloodType: 'O+', address: '77 Pleasant Street, Brockton, MA 02301',
      conditions: ['COPD', 'Hypertension', 'Type 2 Diabetes'],
      allergies: ['Codeine', 'Contrast dye'],
      insurance: 'Tufts Health Plan', emergencyContact: 'George Beaumont (508) 555-1338'
    },
    {
      id: 'P014', name: 'Michael S. Andersen', dob: '1990-07-11', gender: 'Male',
      phone: '(617) 555-1440', email: 'mike.andersen@techbox.io',
      bloodType: 'A-', address: '156 Huntington Ave, Boston, MA 02115',
      conditions: ['Crohn\'s Disease'],
      allergies: ['Ibuprofen'],
      insurance: 'Harvard Pilgrim', emergencyContact: 'Anne Andersen (617) 555-1441'
    },
    {
      id: 'P015', name: 'Frances J. Kowalski', dob: '1952-12-19', gender: 'Female',
      phone: '(781) 555-1550', email: 'frances.kowalski@homepost.net',
      bloodType: 'AB+', address: '62 Winter Street, Medford, MA 02155',
      conditions: ['Parkinson\'s Disease', 'Hypertension', 'Osteoporosis'],
      allergies: ['Penicillin', 'Sulfa drugs'],
      insurance: 'Medicare', emergencyContact: 'David Kowalski (781) 555-1551'
    }
  ];

  // ── DOCTORS ──────────────────────────────────────────────
  var doctors = [
    {
      id: 'D001', name: 'Dr. Jonathan P. Mercer', specialty: 'Internal Medicine',
      phone: '(617) 555-2001', email: 'j.mercer@meditrack.clinic',
      department: 'Internal Medicine', floor: '3',
      bio: 'Board-certified internist with 18 years of experience in chronic disease management.',
      schedule: { Mon: '8:00–16:00', Tue: '8:00–16:00', Wed: 'Off', Thu: '8:00–16:00', Fri: '8:00–12:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D002', name: 'Dr. Rachel H. Okonkwo', specialty: 'Cardiology',
      phone: '(617) 555-2022', email: 'r.okonkwo@meditrack.clinic',
      department: 'Cardiology', floor: '4',
      bio: 'Interventional cardiologist specializing in heart failure and arrhythmia management.',
      schedule: { Mon: '9:00–17:00', Tue: '9:00–17:00', Wed: '9:00–17:00', Thu: 'Off', Fri: '9:00–15:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D003', name: 'Dr. William F. Santiago', specialty: 'Endocrinology',
      phone: '(617) 555-2043', email: 'w.santiago@meditrack.clinic',
      department: 'Endocrinology', floor: '3',
      bio: 'Endocrinologist specializing in diabetes management, thyroid disorders, and metabolic conditions.',
      schedule: { Mon: '8:00–16:00', Tue: 'Off', Wed: '8:00–16:00', Thu: '8:00–16:00', Fri: '8:00–16:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D004', name: 'Dr. Priya S. Krishnamurthy', specialty: 'Rheumatology',
      phone: '(617) 555-2064', email: 'p.krishnamurthy@meditrack.clinic',
      department: 'Rheumatology', floor: '2',
      bio: 'Rheumatologist with expertise in autoimmune diseases, lupus, and arthritis.',
      schedule: { Mon: '9:00–15:00', Tue: '9:00–15:00', Wed: '9:00–15:00', Thu: '9:00–15:00', Fri: 'Off', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D005', name: 'Dr. Thomas A. Brennan', specialty: 'Pulmonology',
      phone: '(617) 555-2085', email: 't.brennan@meditrack.clinic',
      department: 'Pulmonology', floor: '5',
      bio: 'Pulmonologist specializing in COPD, asthma, and sleep-disordered breathing.',
      schedule: { Mon: '8:00–14:00', Tue: '8:00–14:00', Wed: 'Off', Thu: '8:00–14:00', Fri: '8:00–14:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D006', name: 'Dr. Angela M. Novak', specialty: 'Nephrology',
      phone: '(617) 555-2106', email: 'a.novak@meditrack.clinic',
      department: 'Internal Medicine', floor: '3',
      bio: 'Nephrologist focused on chronic kidney disease, hypertension nephropathy, and dialysis management.',
      schedule: { Mon: 'Off', Tue: '10:00–18:00', Wed: '10:00–18:00', Thu: '10:00–18:00', Fri: '10:00–16:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D007', name: 'Dr. Marcus L. Osei', specialty: 'Gastroenterology',
      phone: '(617) 555-2127', email: 'm.osei@meditrack.clinic',
      department: 'Gastroenterology', floor: '2',
      bio: 'Gastroenterologist specializing in IBD, GERD, and colorectal cancer screening.',
      schedule: { Mon: '9:00–17:00', Tue: '9:00–17:00', Wed: 'Off', Thu: '9:00–17:00', Fri: '9:00–13:00', Sat: 'Off', Sun: 'Off' }
    },
    {
      id: 'D008', name: 'Dr. Catherine B. Whitmore', specialty: 'Neurology',
      phone: '(617) 555-2148', email: 'c.whitmore@meditrack.clinic',
      department: 'Neurology', floor: '6',
      bio: 'Neurologist specializing in Parkinson\'s disease, migraines, and movement disorders.',
      schedule: { Mon: '9:00–15:00', Tue: 'Off', Wed: '9:00–15:00', Thu: '9:00–15:00', Fri: '9:00–15:00', Sat: 'Off', Sun: 'Off' }
    }
  ];

  // ── DEPARTMENTS ──────────────────────────────────────────
  var departments = [
    {
      id: 'DEP01', name: 'Internal Medicine', head: 'Dr. Jonathan P. Mercer',
      floor: '3rd Floor', phone: '(617) 555-3001', staffCount: 12,
      doctorIds: ['D001', 'D006']
    },
    {
      id: 'DEP02', name: 'Cardiology', head: 'Dr. Rachel H. Okonkwo',
      floor: '4th Floor', phone: '(617) 555-3002', staffCount: 8,
      doctorIds: ['D002']
    },
    {
      id: 'DEP03', name: 'Endocrinology', head: 'Dr. William F. Santiago',
      floor: '3rd Floor', phone: '(617) 555-3003', staffCount: 6,
      doctorIds: ['D003']
    },
    {
      id: 'DEP04', name: 'Rheumatology', head: 'Dr. Priya S. Krishnamurthy',
      floor: '2nd Floor', phone: '(617) 555-3004', staffCount: 5,
      doctorIds: ['D004']
    },
    {
      id: 'DEP05', name: 'Pulmonology', head: 'Dr. Thomas A. Brennan',
      floor: '5th Floor', phone: '(617) 555-3005', staffCount: 7,
      doctorIds: ['D005']
    },
    {
      id: 'DEP06', name: 'Gastroenterology', head: 'Dr. Marcus L. Osei',
      floor: '2nd Floor', phone: '(617) 555-3006', staffCount: 6,
      doctorIds: ['D007']
    },
    {
      id: 'DEP07', name: 'Neurology', head: 'Dr. Catherine B. Whitmore',
      floor: '6th Floor', phone: '(617) 555-3007', staffCount: 9,
      doctorIds: ['D008']
    }
  ];

  // ── APPOINTMENTS ─────────────────────────────────────────
  // Dates spread across Aug–Sep 2026
  var appointments = [
    { id: 'A001', patientId: 'P001', doctorId: 'D001', date: '2026-08-18', time: '09:00', status: 'scheduled', notes: 'Routine follow-up for hypertension management. BP check and medication review.' },
    { id: 'A002', patientId: 'P002', doctorId: 'D005', date: '2026-08-18', time: '10:00', status: 'scheduled', notes: 'Asthma control assessment. Review current inhaler regimen.' },
    { id: 'A003', patientId: 'P005', doctorId: 'D002', date: '2026-08-18', time: '11:00', status: 'scheduled', notes: 'Cardiology follow-up for CHF. Echocardiogram review.' },
    { id: 'A004', patientId: 'P010', doctorId: 'D003', date: '2026-08-18', time: '14:00', status: 'scheduled', notes: 'Diabetes management. HbA1c results and insulin adjustment.' },
    { id: 'A005', patientId: 'P013', doctorId: 'D005', date: '2026-08-18', time: '15:00', status: 'scheduled', notes: 'COPD exacerbation follow-up. Spirometry review.' },
    { id: 'A006', patientId: 'P003', doctorId: 'D004', date: '2026-08-19', time: '09:00', status: 'scheduled', notes: 'Rheumatoid arthritis. Methotrexate monitoring labs review.' },
    { id: 'A007', patientId: 'P009', doctorId: 'D006', date: '2026-08-19', time: '10:30', status: 'scheduled', notes: 'CKD Stage 3 management. Creatinine and GFR review.' },
    { id: 'A008', patientId: 'P011', doctorId: 'D004', date: '2026-08-19', time: '13:00', status: 'scheduled', notes: 'Lupus flare assessment. ANA titers review.' },
    { id: 'A009', patientId: 'P015', doctorId: 'D008', date: '2026-08-19', time: '14:30', status: 'scheduled', notes: 'Parkinson\'s disease follow-up. Medication adjustment.' },
    { id: 'A010', patientId: 'P006', doctorId: 'D008', date: '2026-08-20', time: '09:00', status: 'scheduled', notes: 'Migraine management. Review of preventive therapy.' },
    { id: 'A011', patientId: 'P007', doctorId: 'D001', date: '2026-08-20', time: '10:00', status: 'scheduled', notes: 'Hypertension and hypothyroidism follow-up. TSH results.' },
    { id: 'A012', patientId: 'P014', doctorId: 'D007', date: '2026-08-20', time: '11:30', status: 'scheduled', notes: 'Crohn\'s disease flare. Consider biologic therapy.' },
    { id: 'A013', patientId: 'P008', doctorId: 'D007', date: '2026-08-21', time: '09:00', status: 'scheduled', notes: 'GERD management and weight reduction counseling.' },
    { id: 'A014', patientId: 'P012', doctorId: 'D001', date: '2026-08-21', time: '10:00', status: 'scheduled', notes: 'Depression follow-up. Medication efficacy review.' },
    { id: 'A015', patientId: 'P004', doctorId: 'D001', date: '2026-08-21', time: '14:00', status: 'scheduled', notes: 'Hyperlipidemia. Statin therapy and lipid panel review.' },
    { id: 'A016', patientId: 'P001', doctorId: 'D003', date: '2026-08-22', time: '09:00', status: 'scheduled', notes: 'Diabetes annual review. Foot exam and retinal referral.' },
    { id: 'A017', patientId: 'P002', doctorId: 'D005', date: '2026-08-25', time: '10:00', status: 'scheduled', notes: 'Pulmonary function test follow-up.' },
    { id: 'A018', patientId: 'P005', doctorId: 'D003', date: '2026-08-25', time: '11:00', status: 'scheduled', notes: 'Diabetes management alongside cardiac care.' },
    { id: 'A019', patientId: 'P009', doctorId: 'D001', date: '2026-08-25', time: '14:00', status: 'scheduled', notes: 'Anemia management. Iron studies follow-up.' },
    { id: 'A020', patientId: 'P013', doctorId: 'D003', date: '2026-08-26', time: '09:00', status: 'scheduled', notes: 'Diabetes education and medication compliance.' },
    { id: 'A021', patientId: 'P015', doctorId: 'D001', date: '2026-08-26', time: '10:30', status: 'scheduled', notes: 'Hypertension management and fall risk assessment.' },
    { id: 'A022', patientId: 'P010', doctorId: 'D001', date: '2026-08-27', time: '09:00', status: 'scheduled', notes: 'Peripheral neuropathy assessment. Nerve conduction study results.' },
    { id: 'A023', patientId: 'P011', doctorId: 'D001', date: '2026-08-27', time: '11:00', status: 'scheduled', notes: 'Fibromyalgia symptom management.' },
    { id: 'A024', patientId: 'P007', doctorId: 'D003', date: '2026-08-28', time: '09:00', status: 'scheduled', notes: 'Hypothyroidism review. Levothyroxine dosing.' },
    { id: 'A025', patientId: 'P004', doctorId: 'D003', date: '2026-08-28', time: '14:00', status: 'scheduled', notes: 'Annual metabolic panel review.' },
    // Completed appointments (past)
    { id: 'A026', patientId: 'P001', doctorId: 'D001', date: '2026-08-05', time: '09:00', status: 'completed', notes: 'Blood pressure well-controlled. Continue current regimen.' },
    { id: 'A027', patientId: 'P002', doctorId: 'D005', date: '2026-08-06', time: '10:00', status: 'completed', notes: 'Asthma stable. Refilled rescue inhaler.' },
    { id: 'A028', patientId: 'P003', doctorId: 'D004', date: '2026-08-07', time: '09:30', status: 'completed', notes: 'RA stable on current DMARDs. Labs normal.' },
    { id: 'A029', patientId: 'P005', doctorId: 'D002', date: '2026-08-07', time: '11:00', status: 'completed', notes: 'CHF compensated. Adjusted diuretics.' },
    { id: 'A030', patientId: 'P006', doctorId: 'D008', date: '2026-08-10', time: '09:00', status: 'completed', notes: 'Migraine frequency improved. Continue topiramate.' },
    // Cancelled appointments
    { id: 'A031', patientId: 'P008', doctorId: 'D007', date: '2026-08-12', time: '14:00', status: 'cancelled', notes: 'Patient called to cancel. Work conflict.' },
    { id: 'A032', patientId: 'P012', doctorId: 'D001', date: '2026-08-13', time: '10:00', status: 'cancelled', notes: 'No-show. Rescheduled to Aug 21.' },
    { id: 'A033', patientId: 'P014', doctorId: 'D007', date: '2026-08-14', time: '11:00', status: 'cancelled', notes: 'Patient hospitalized. Appointment cancelled.' },
    // More upcoming
    { id: 'A034', patientId: 'P006', doctorId: 'D001', date: '2026-09-02', time: '09:00', status: 'scheduled', notes: 'Anxiety disorder follow-up. Medication review.' },
    { id: 'A035', patientId: 'P015', doctorId: 'D008', date: '2026-09-03', time: '10:00', status: 'scheduled', notes: 'Parkinson\'s quarterly follow-up. Balance and gait assessment.' }
  ];

  // ── MEDICAL HISTORY ──────────────────────────────────────
  var medicalHistory = [
    // P001 — Margaret Thornton
    { id: 'MH001', patientId: 'P001', date: '2024-03-10', diagnosis: 'Hypertension — Stage 2', treatment: 'Initiated Lisinopril 10mg daily', prescribedBy: 'Dr. Jonathan P. Mercer', notes: 'BP 158/96 at visit. Dietary sodium restriction counseled.' },
    { id: 'MH002', patientId: 'P001', date: '2024-09-15', diagnosis: 'Type 2 Diabetes Mellitus — Poorly controlled', treatment: 'Added Metformin 500mg BID; HbA1c 8.9%', prescribedBy: 'Dr. William F. Santiago', notes: 'Referred to diabetes educator. Follow-up in 3 months.' },
    { id: 'MH003', patientId: 'P001', date: '2025-02-20', diagnosis: 'Hypertension — Improved', treatment: 'Increased Lisinopril to 20mg; added Amlodipine 5mg', prescribedBy: 'Dr. Jonathan P. Mercer', notes: 'BP 148/88. Continue dietary modifications.' },
    { id: 'MH004', patientId: 'P001', date: '2025-11-08', diagnosis: 'Type 2 Diabetes — Moderate control', treatment: 'Metformin increased to 1000mg BID. Added Glipizide 5mg.', prescribedBy: 'Dr. William F. Santiago', notes: 'HbA1c improved to 7.6%. Continue monitoring.' },
    // P002 — James Calloway
    { id: 'MH005', patientId: 'P002', date: '2023-05-18', diagnosis: 'Moderate Persistent Asthma', treatment: 'Started Fluticasone/Salmeterol inhaler (Advair 250/50) BID', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'Spirometry: FEV1 68% predicted. Trigger avoidance counseled.' },
    { id: 'MH006', patientId: 'P002', date: '2024-01-22', diagnosis: 'Acute Asthma Exacerbation', treatment: 'Prednisone 40mg x 5 days. Added Montelukast 10mg nightly.', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'Triggered by respiratory infection. Patient educated on action plan.' },
    { id: 'MH007', patientId: 'P002', date: '2025-03-30', diagnosis: 'Allergic Rhinitis — Seasonal', treatment: 'Loratadine 10mg daily PRN. Nasal fluticasone spray.', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'Spring pollen season. Symptoms well-controlled.' },
    { id: 'MH008', patientId: 'P002', date: '2026-01-14', diagnosis: 'Asthma — Well Controlled', treatment: 'Stepped down to Fluticasone 110mcg BID monotherapy.', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'FEV1 82% predicted. No nocturnal symptoms past 3 months.' },
    // P003 — Dorothy Nakamura
    { id: 'MH009', patientId: 'P003', date: '2022-07-11', diagnosis: 'Rheumatoid Arthritis — Seropositive', treatment: 'Initiated Methotrexate 15mg weekly + Folic acid 1mg daily', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'RF positive, anti-CCP elevated. Baseline LFTs obtained.' },
    { id: 'MH010', patientId: 'P003', date: '2023-04-05', diagnosis: 'Osteoporosis — Lumbar Spine', treatment: 'Alendronate 70mg weekly. Calcium 1200mg + Vit D 1000IU daily.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'DEXA: T-score -2.7 at L2-L4. Fracture risk counseling.' },
    { id: 'MH011', patientId: 'P003', date: '2024-10-17', diagnosis: 'RA — Inadequate response to MTX', treatment: 'Added Hydroxychloroquine 200mg BID. Rheumatology review.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'DAS28 score 4.1. Consider biologic if no improvement in 3 months.' },
    { id: 'MH012', patientId: 'P003', date: '2025-06-30', diagnosis: 'RA — Improved on combination therapy', treatment: 'Continue MTX + HCQ. Annual eye exam ordered.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'DAS28 reduced to 2.8. Patient reporting less morning stiffness.' },
    // P005 — Helen Vasquez
    { id: 'MH013', patientId: 'P005', date: '2021-11-03', diagnosis: 'Congestive Heart Failure — EF 35%', treatment: 'Carvedilol 6.25mg BID, Lisinopril 5mg, Furosemide 40mg', prescribedBy: 'Dr. Rachel H. Okonkwo', notes: 'Echo: dilated cardiomyopathy. Referred to advanced heart failure program.' },
    { id: 'MH014', patientId: 'P005', date: '2022-08-22', diagnosis: 'Atrial Fibrillation — Paroxysmal', treatment: 'Apixaban 5mg BID for stroke prevention. Metoprolol rate control.', prescribedBy: 'Dr. Rachel H. Okonkwo', notes: 'CHA2DS2-VASc score 5. Anticoagulation indicated.' },
    { id: 'MH015', patientId: 'P005', date: '2024-05-09', diagnosis: 'Type 2 Diabetes — Newly Diagnosed', treatment: 'Empagliflozin 10mg daily (cardiac benefit). Metformin 500mg BID.', prescribedBy: 'Dr. William F. Santiago', notes: 'HbA1c 8.1%. SGLT-2 inhibitor chosen for cardiac protection.' },
    { id: 'MH016', patientId: 'P005', date: '2026-02-14', diagnosis: 'CHF — Acute Decompensation', treatment: 'IV Furosemide 80mg. Adjusted oral diuretics on discharge.', prescribedBy: 'Dr. Rachel H. Okonkwo', notes: 'Hospitalized x3 days. Gained 8 lbs water weight. Patient counseled on daily weights.' },
    // P009 — Barbara Whitfield
    { id: 'MH017', patientId: 'P009', date: '2020-03-15', diagnosis: 'Chronic Kidney Disease — Stage 2', treatment: 'Dietary protein restriction. BP target < 130/80.', prescribedBy: 'Dr. Angela M. Novak', notes: 'eGFR 68. Avoid nephrotoxic agents. Follow-up in 6 months.' },
    { id: 'MH018', patientId: 'P009', date: '2022-09-01', diagnosis: 'CKD Progression — Stage 3a', treatment: 'Amlodipine added. Erythropoietin for anemia of CKD.', prescribedBy: 'Dr. Angela M. Novak', notes: 'eGFR 52. Hgb 10.1. Renal dietitian referral.' },
    { id: 'MH019', patientId: 'P009', date: '2024-01-20', diagnosis: 'CKD Stage 3b — Anemia of Chronic Disease', treatment: 'IV Iron sucrose infusions. Adjusted erythropoietin dose.', prescribedBy: 'Dr. Angela M. Novak', notes: 'eGFR 44. Hgb 9.4. Discussed future dialysis planning.' },
    { id: 'MH020', patientId: 'P009', date: '2025-07-11', diagnosis: 'CKD Stage 3b — Stable', treatment: 'Continue current management. Fistula planning discussed.', prescribedBy: 'Dr. Angela M. Novak', notes: 'eGFR 41. Stable. Vascular surgery referral for AV fistula planning.' },
    // P010 — Christopher Ellis
    { id: 'MH021', patientId: 'P010', date: '2019-06-20', diagnosis: 'Type 1 Diabetes Mellitus — Uncontrolled', treatment: 'Basal-bolus insulin regimen. Continuous glucose monitoring.', prescribedBy: 'Dr. William F. Santiago', notes: 'HbA1c 9.8%. CGM initiated. Diabetes educator referral.' },
    { id: 'MH022', patientId: 'P010', date: '2021-11-15', diagnosis: 'Peripheral Diabetic Neuropathy', treatment: 'Gabapentin 300mg TID. Podiatry referral. Annual foot exams.', prescribedBy: 'Dr. William F. Santiago', notes: 'NCS: mild-moderate polyneuropathy. Symptom control with gabapentin.' },
    { id: 'MH023', patientId: 'P010', date: '2023-08-02', diagnosis: 'T1DM — Improved with closed-loop system', treatment: 'Transitioned to insulin pump with hybrid closed-loop.', prescribedBy: 'Dr. William F. Santiago', notes: 'HbA1c 7.1%. Time-in-range 78%. Patient very engaged.' },
    { id: 'MH024', patientId: 'P010', date: '2025-12-05', diagnosis: 'Peripheral Neuropathy — Progressing', treatment: 'Pregabalin 75mg BID replacing gabapentin. Duloxetine added.', prescribedBy: 'Dr. William F. Santiago', notes: 'NCS repeat shows progression. Pain VAS 6/10. Multidisciplinary pain clinic referral.' },
    // P011 — Susan Patel
    { id: 'MH025', patientId: 'P011', date: '2018-04-03', diagnosis: 'Systemic Lupus Erythematosus — Newly Diagnosed', treatment: 'Hydroxychloroquine 400mg daily. Sun protection counseling.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'ANA 1:640, dsDNA positive. Mild arthritis and malar rash at presentation.' },
    { id: 'MH026', patientId: 'P011', date: '2020-09-18', diagnosis: 'Lupus — Moderate Flare with Nephritis', treatment: 'Prednisone 40mg taper. Mycophenolate mofetil 1g BID.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'Proteinuria 2.3g/day. Renal biopsy: Class III nephritis. Nephrology co-management.' },
    { id: 'MH027', patientId: 'P011', date: '2022-11-30', diagnosis: 'Fibromyalgia — Comorbid', treatment: 'Duloxetine 60mg daily. Low-impact exercise program.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'Widespread pain, fatigue, sleep disturbance. Fibromyalgia diagnostic criteria met.' },
    { id: 'MH028', patientId: 'P011', date: '2025-03-14', diagnosis: 'SLE — Quiescent on current therapy', treatment: 'Maintenance HCQ + MMF. Annual ophthalmology review.', prescribedBy: 'Dr. Priya S. Krishnamurthy', notes: 'SLEDAI score 2. Proteinuria resolved. Continue current regimen.' },
    // P013 — Linda Beaumont
    { id: 'MH029', patientId: 'P013', date: '2016-02-08', diagnosis: 'COPD — Gold Stage II', treatment: 'Tiotropium inhaler daily. Smoking cessation program.', prescribedBy: 'Dr. Thomas A. Brennan', notes: '40 pack-year smoking history. FEV1/FVC 0.61. Pulmonary rehab referral.' },
    { id: 'MH030', patientId: 'P013', date: '2019-07-22', diagnosis: 'COPD — Gold Stage III; Acute Exacerbation', treatment: 'Add LABA/ICS combination. Oral prednisone taper. Azithromycin 5-day.', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'Hospitalized 4 days. O2 sat 88% on admission. Home oxygen assessed.' },
    { id: 'MH031', patientId: 'P013', date: '2022-05-17', diagnosis: 'COPD with Type 2 Diabetes — Poorly Managed', treatment: 'Diabetes: added Sitagliptin 100mg. Inhaled corticosteroids adjusted.', prescribedBy: 'Dr. William F. Santiago', notes: 'HbA1c 9.2%. ICS may worsen glucose control — adjusted dosing timing.' },
    { id: 'MH032', patientId: 'P013', date: '2025-10-01', diagnosis: 'COPD Stable, Diabetes Moderate Control', treatment: 'Current triple inhaler therapy (Trelegy). Metformin + Sitagliptin.', prescribedBy: 'Dr. Thomas A. Brennan', notes: 'FEV1 42%. HbA1c 7.8%. Maintains good adherence. Annual influenza vaccine given.' },
    // P015 — Frances Kowalski
    { id: 'MH033', patientId: 'P015', date: '2017-09-25', diagnosis: 'Parkinson\'s Disease — Early Stage', treatment: 'Carbidopa-Levodopa 25/100 TID. Physical therapy referral.', prescribedBy: 'Dr. Catherine B. Whitmore', notes: 'Tremor and bradykinesia. Hoehn-Yahr Stage 2. Good response to levodopa.' },
    { id: 'MH034', patientId: 'P015', date: '2020-04-14', diagnosis: 'Parkinson\'s — Moderate Stage with Dyskinesias', treatment: 'Added Amantadine 100mg BID. Adjusted levodopa timing.', prescribedBy: 'Dr. Catherine B. Whitmore', notes: 'Hoehn-Yahr Stage 3. Wearing-off phenomenon noted. DBS candidacy discussed.' },
    { id: 'MH035', patientId: 'P015', date: '2023-01-09', diagnosis: 'Osteoporosis — Hip and Spine', treatment: 'Denosumab 60mg subcutaneous every 6 months.', prescribedBy: 'Dr. Catherine B. Whitmore', notes: 'T-score -3.1. High fracture risk. Gait assessment — fall prevention program started.' },
    { id: 'MH036', patientId: 'P015', date: '2026-03-22', diagnosis: 'Parkinson\'s — Advanced with Cognitive Decline', treatment: 'Added Rivastigmine patch 9.5mg/24h. Caregiver support discussed.', prescribedBy: 'Dr. Catherine B. Whitmore', notes: 'MoCA 22/30. Memory clinic referral. Son is primary caregiver.' }
  ];

  // ── HELPER FUNCTIONS ──────────────────────────────────────

  function getPatientById(id) {
    return patients.find(function (p) { return p.id === id; }) || null;
  }

  function getDoctorById(id) {
    return doctors.find(function (d) { return d.id === id; }) || null;
  }

  function getDepartmentById(id) {
    return departments.find(function (d) { return d.id === id; }) || null;
  }

  function getAppointmentsByPatient(patientId) {
    return appointments.filter(function (a) { return a.patientId === patientId; });
  }

  function getAppointmentsByDoctor(doctorId) {
    return appointments.filter(function (a) { return a.doctorId === doctorId; });
  }

  function getAppointmentsByDate(date) {
    return appointments.filter(function (a) { return a.date === date; });
  }

  function getMedicalHistoryByPatient(patientId) {
    return medicalHistory.filter(function (m) { return m.patientId === patientId; });
  }

  function calculateAge(dob) {
    var today = new Date();
    var birth = new Date(dob);
    var age = today.getFullYear() - birth.getFullYear();
    var m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) { age--; }
    return age;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    var parts = timeStr.split(':');
    var h = parseInt(parts[0]);
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
  }

  function getInitials(name) {
    return name.replace('Dr. ', '').split(' ').filter(function (w, i) { return i === 0 || i === name.split(' ').length - 1; }).map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
  }

  function getTodayAppts() {
    var today = new Date().toISOString().slice(0, 10);
    var todayAppts = getAppointmentsByDate(today);
    if (todayAppts.length === 0) {
      // Return next available date's appointments
      var future = appointments
        .filter(function (a) { return a.date >= today && a.status === 'scheduled'; })
        .sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (future.length > 0) {
        return getAppointmentsByDate(future[0].date);
      }
    }
    return todayAppts;
  }

  function getStatusBadge(status) {
    var map = {
      'scheduled': '<span class="badge badge-blue">Scheduled</span>',
      'completed': '<span class="badge badge-green">Completed</span>',
      'cancelled': '<span class="badge badge-red">Cancelled</span>'
    };
    return map[status] || '<span class="badge badge-gray">' + status + '</span>';
  }

  function getBloodTypeBadge(bt) {
    return '<span class="badge badge-navy">' + bt + '</span>';
  }

  function buildSidebar(activePage) {
    var pages = [
      { href: 'index.html', icon: '📊', label: 'Dashboard', key: 'dashboard' },
      { href: 'patients.html', icon: '👥', label: 'Patients', key: 'patients' },
      { href: 'appointments.html', icon: '📅', label: 'Appointments', key: 'appointments' },
      { href: 'doctors.html', icon: '👨‍⚕️', label: 'Doctors', key: 'doctors' },
      { href: 'departments.html', icon: '🏢', label: 'Departments', key: 'departments' },
      { href: 'reports.html', icon: '📈', label: 'Reports', key: 'reports' }
    ];
    var links = pages.map(function (p) {
      var cls = p.key === activePage ? ' class="active"' : '';
      return '<a href="' + p.href + '"' + cls + '><span class="nav-icon">' + p.icon + '</span> ' + p.label + '</a>';
    }).join('\n');

    return '<aside class="sidebar">' +
      '<a class="sidebar-brand" href="index.html">' +
      '<span class="sidebar-brand-icon">🏥</span>' +
      '<span><span class="sidebar-brand-text">MediTrack</span>' +
      '<span class="sidebar-brand-sub">Clinic Management</span></span>' +
      '</a>' +
      '<nav class="sidebar-nav">' + links + '</nav>' +
      '<div class="sidebar-footer">v2.4.1 &bull; Boston Medical Group</div>' +
      '</aside>';
  }

  // ── PUBLIC API ────────────────────────────────────────────
  return {
    patients: patients,
    doctors: doctors,
    departments: departments,
    appointments: appointments,
    medicalHistory: medicalHistory,
    getPatientById: getPatientById,
    getDoctorById: getDoctorById,
    getDepartmentById: getDepartmentById,
    getAppointmentsByPatient: getAppointmentsByPatient,
    getAppointmentsByDoctor: getAppointmentsByDoctor,
    getAppointmentsByDate: getAppointmentsByDate,
    getMedicalHistoryByPatient: getMedicalHistoryByPatient,
    calculateAge: calculateAge,
    formatDate: formatDate,
    formatTime: formatTime,
    getInitials: getInitials,
    getTodayAppts: getTodayAppts,
    getStatusBadge: getStatusBadge,
    getBloodTypeBadge: getBloodTypeBadge,
    buildSidebar: buildSidebar
  };
})();
