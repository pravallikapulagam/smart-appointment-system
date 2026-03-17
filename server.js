const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/images", express.static(path.join(__dirname, "images")));

// ✅ PostgreSQL connection (Neon)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const SECRET = "smartclinicsecret";

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= VERIFY TOKEN ================= */
function verifyToken(req, res, next) {
  const header = req.headers["authorization"];

  if (!header) return res.status(401).json({ message: "No token" });

  const token = header.split(" ")[1];

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token" });

    req.user = decoded;
    next();
  });
}

/* ================= HOSPITALS ================= */
app.get("/hospitals/:city", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM hospitals WHERE city = $1",
      [req.params.city]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching hospitals" });
  }
});

/* ================= SINGLE HOSPITAL ================= */
app.get("/hospital/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM hospitals WHERE id = $1",
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Error fetching hospital" });
  }
});

/* ================= DOCTORS ================= */
app.get("/hospital-doctors/:hospital_id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM doctors WHERE hospital_id = $1",
      [req.params.hospital_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching doctors" });
  }
});

/* ================= ADMIN STATS ================= */
app.get("/admin/stats", verifyToken, async (req, res) => {
  try {
    const doctors = await db.query("SELECT COUNT(*) FROM doctors");
    const apps = await db.query("SELECT COUNT(*) FROM appointments");
    const completed = await db.query(
      "SELECT COUNT(*) FROM appointments WHERE status='Completed'"
    );
    const cancelled = await db.query(
      "SELECT COUNT(*) FROM appointments WHERE status='Cancelled'"
    );
    const booked = await db.query(
      "SELECT COUNT(*) FROM appointments WHERE status='Booked'"
    );

    res.json({
      totalDoctors: doctors.rows[0].count,
      totalAppointments: apps.rows[0].count,
      completed: completed.rows[0].count,
      cancelled: cancelled.rows[0].count,
      booked: booked.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching stats" });
  }
});

/* ================= ADMIN DOCTORS ================= */
app.get("/admin/doctors", verifyToken, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM doctors");
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Error fetching doctors" });
  }
});

app.post("/admin/doctors", verifyToken, async (req, res) => {
  const { name, specialization, experience } = req.body;

  try {
    await db.query(
      "INSERT INTO doctors (name, specialization, experience) VALUES ($1,$2,$3)",
      [name, specialization, experience]
    );
    res.json({ message: "Doctor added" });
  } catch {
    res.status(500).json({ message: "Error adding doctor" });
  }
});

app.delete("/admin/doctors/:id", verifyToken, async (req, res) => {
  try {
    await db.query("DELETE FROM doctors WHERE id=$1", [req.params.id]);
    res.json({ message: "Doctor deleted" });
  } catch {
    res.status(500).json({ message: "Error deleting doctor" });
  }
});

/* ================= BOOK APPOINTMENT ================= */
app.post("/appointments", verifyToken, async (req, res) => {
  const {
    doctor_id,
    patient_name,
    age,
    phone,
    appointment_date,
    appointment_time,
  } = req.body;

  try {
    const countResult = await db.query(
      "SELECT COUNT(*) FROM appointments WHERE doctor_id=$1 AND appointment_date=$2",
      [doctor_id, appointment_date]
    );

    const tokenNumber = parseInt(countResult.rows[0].count) + 1;

    await db.query(
      `INSERT INTO appointments 
      (user_id, doctor_id, patient_name, age, phone, appointment_date, appointment_time, token_number, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Booked')`,
      [
        req.user.id,
        doctor_id,
        patient_name,
        age,
        phone,
        appointment_date,
        appointment_time,
        tokenNumber,
      ]
    );

    res.json({
      message: "Booked",
      token: tokenNumber,
    });
  } catch (err) {
    res.status(500).json({ message: "Error booking" });
  }
});


app.use(express.static(path.join(__dirname, "frontend")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});
/* ================= START ================= */
app.listen(3000, () => {
  console.log("Server running");
});

app.get("/", (req, res) => {
  res.send("Smart Appointment System Backend is Running 🚀");
});