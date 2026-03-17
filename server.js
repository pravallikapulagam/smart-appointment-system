const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/images", express.static(path.join(__dirname, "images")));

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root123",
  database: "appointment_db"
});

db.connect((err) => {
  if (err) {
    console.log("Database connection failed:", err);
  } else {
    console.log("MySQL Connected");
  }
});

const SECRET = "smartclinicsecret";


/* ================= LOGIN ================= */

app.post("/login", (req, res) => {

  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, result) => {

      if (err) return res.status(500).json({ message: "Server error" });

      if (result.length === 0)
        return res.status(401).json({ message: "Invalid credentials" });

      const user = result[0];

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
        name: user.name
      });

    }
  );
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

app.get("/hospitals/:city", (req, res) => {

  db.query(
    "SELECT * FROM hospitals WHERE city = ?",
    [req.params.city],
    (err, result) => {

      if (err) return res.status(500).json({ message: "Error fetching hospitals" });

      res.json(result);

    }
  );

});


/* ================= SINGLE HOSPITAL ================= */

app.get("/hospital/:id", (req, res) => {

  db.query(
    "SELECT * FROM hospitals WHERE id = ?",
    [req.params.id],
    (err, result) => {

      if (err) return res.status(500).json({ message: "Error fetching hospital" });

      res.json(result[0]);

    }
  );

});


/* ================= DOCTORS BY HOSPITAL ================= */

app.get("/hospital-doctors/:hospital_id", (req, res) => {

  db.query(
    "SELECT * FROM doctors WHERE hospital_id = ?",
    [req.params.hospital_id],
    (err, result) => {

      if (err) return res.status(500).json({ message: "Error fetching doctors" });

      res.json(result);

    }
  );

});


/* ================= ADMIN STATS ================= */

app.get("/admin/stats", verifyToken, (req, res) => {

  const stats = {};

  db.query("SELECT COUNT(*) AS total FROM doctors", (err, doctors) => {

    stats.totalDoctors = doctors[0].total;

    db.query("SELECT COUNT(*) AS total FROM appointments", (err, apps) => {

      stats.totalAppointments = apps[0].total;

      db.query("SELECT COUNT(*) AS total FROM appointments WHERE status='Completed'", (err, completed) => {

        stats.completed = completed[0].total;

        db.query("SELECT COUNT(*) AS total FROM appointments WHERE status='Cancelled'", (err, cancelled) => {

          stats.cancelled = cancelled[0].total;

          db.query("SELECT COUNT(*) AS total FROM appointments WHERE status='Booked'", (err, booked) => {

            stats.booked = booked[0].total;

            res.json(stats);

          });

        });

      });

    });

  });

});


/* ================= ADMIN DOCTORS ================= */

app.get("/admin/doctors", verifyToken, (req, res) => {

  db.query("SELECT * FROM doctors", (err, result) => {

    if (err) return res.status(500).json({ message: "Error fetching doctors" });

    res.json(result);

  });

});


app.post("/admin/doctors", verifyToken, (req, res) => {

  const { name, specialization, experience } = req.body;

  db.query(
    "INSERT INTO doctors (name, specialization, experience) VALUES (?, ?, ?)",
    [name, specialization, experience],
    (err) => {

      if (err) return res.status(500).json({ message: "Error adding doctor" });

      res.json({ message: "Doctor added successfully" });

    }
  );

});


app.delete("/admin/doctors/:id", verifyToken, (req, res) => {

  db.query(
    "DELETE FROM doctors WHERE id = ?",
    [req.params.id],
    (err) => {

      if (err) return res.status(500).json({ message: "Error deleting doctor" });

      res.json({ message: "Doctor deleted" });

    }
  );

});



// ================= ADMIN VIEW APPOINTMENTS =================
app.get("/admin/appointments", verifyToken, (req, res) => {

  db.query(
    `SELECT 
        a.id,
        u.name AS user_name,
        a.patient_name,
        a.phone,
        a.appointment_date,
        a.appointment_time,
        a.token_number,
        a.status,
        d.name AS doctor_name,
        h.name AS hospital_name
     FROM appointments a
     JOIN users u ON a.user_id = u.id
     JOIN doctors d ON a.doctor_id = d.id
     JOIN hospitals h ON d.hospital_id = h.id`,
    (err, result) => {

      if (err) {
        return res.status(500).json({ message: "Error fetching appointments" });
      }

      res.json(result);

    }
  );

});

/* ================= BOOK APPOINTMENT ================= */

app.post("/appointments", verifyToken, (req, res) => {

  const { doctor_id, patient_name, age, phone, appointment_date, appointment_time } = req.body;

  if (!doctor_id || !patient_name || !phone || !appointment_date || !appointment_time)
    return res.status(400).json({ message: "All fields required" });

  db.query(
    "SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = ? AND appointment_date = ?",
    [doctor_id, appointment_date],
    (err, result) => {

      const tokenNumber = result[0].count + 1;

      db.query(
        `INSERT INTO appointments 
        (user_id, doctor_id, patient_name, age, phone, appointment_date, appointment_time, token_number, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Booked')`,
        [
          req.user.id,
          doctor_id,
          patient_name,
          age,
          phone,
          appointment_date,
          appointment_time,
          tokenNumber
        ],
        (err) => {

          if (err)
            return res.status(500).json({ message: "Error booking appointment" });

          res.json({
            message: "Appointment booked successfully",
            token: tokenNumber
          });

        }
      );

    }
  );

});


/* ================= USER VIEW APPOINTMENTS ================= */

app.get("/appointments", verifyToken, (req, res) => {

  db.query(
    `SELECT 
        a.id,
        a.patient_name,
        a.age,
        a.phone,
        a.appointment_date,
        a.appointment_time,
        a.token_number,
        a.status,
        d.name AS doctor_name,
        h.name AS hospital_name,
        h.id AS hospital_id
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     JOIN hospitals h ON d.hospital_id = h.id
     WHERE a.user_id = ?`,
    [req.user.id],
    (err, result) => {

      if (err) return res.status(500).json({ message: "Error fetching appointments" });

      res.json(result);

    }
  );

});


/* ================= USER CANCEL ================= */

app.put("/appointments/cancel/:id", verifyToken, (req, res) => {

  db.query(
    "UPDATE appointments SET status='Cancelled' WHERE id=? AND user_id=?",
    [req.params.id, req.user.id],
    (err) => {

      if (err) return res.status(500).json({ message: "Error cancelling appointment" });

      res.json({ message: "Appointment cancelled" });

    }
  );

});


/* ================= START SERVER ================= */

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

app.get("/", (req, res) => {
  res.send("Smart Appointment System Backend is Running 🚀");
});