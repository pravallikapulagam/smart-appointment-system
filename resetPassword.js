const bcrypt = require("bcrypt");
const db = require("./db");

async function reset() {
  const newPassword = "123456";
  const hashed = await bcrypt.hash(newPassword, 10);

  db.query(
    "UPDATE users SET password = ? WHERE email = ?",
    [hashed, "prava@gmail.com"],
    (err, result) => {
      if (err) {
        console.log("Error:", err);
      } else {
        console.log("Password reset successful to 123456");
      }
      process.exit();
    }
  );
}

reset();
