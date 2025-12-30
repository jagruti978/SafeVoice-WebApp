require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const pool = require("./config/db");
const session = require("express-session");
const app = express();



app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: "safevoice_secret",
  resave: false,
  saveUninitialized: false
}));

app.get("/", (req, res) => {
  res.render("index");
});



//authentication pages--------------------------------------------
app.get("/login/user", (req, res) => {
  res.render("auth/user-auth", {
    success: req.query.success || null,
    error: req.query.error || null
  });
});

app.get("/login/admin", (req, res) => {
  res.render("auth/admin-auth", {
    success: req.query.success || null,
    error: req.query.error || null
  });
});

app.get("/login/resolver", (req, res) => {
  res.render("auth/resolver-auth", {
    success: req.query.success || null,
    error: req.query.error || null
  });
});



// user login and signup------------------------------------------

app.post("/signup/user", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.redirect("/login/user?error=Please fill all fields");
  }

  try {
    await pool.query(
      "INSERT INTO users (name, email, phone, password) VALUES ($1,$2,$3,$4)",
      [name, email, phone, password]
    );
    res.redirect("/login/user?success=Signup successful! Please login");
  } catch {
    res.redirect("/login/user?error=Email already exists");
  }
});
app.post("/login/user", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1 AND password=$2",
    [email, password]
  );

  if (result.rows.length > 0) {
    req.session.userId = result.rows[0].user_id;
    res.redirect("/dashboard/user");
  } else {
    res.redirect("/login/user?error=Invalid email or password");
  }
});



// admin signup logic------------------------------------------------------
app.post("/signup/admin", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.redirect("/login/admin?error=Please fill all fields");
  }

  await pool.query(
    "INSERT INTO admins (name, email, password) VALUES ($1,$2,$3)",
    [name, email, password]
  );

  res.redirect("/login/admin?success=Admin registered successfully");
});

app.post("/login/admin", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM admins WHERE email=$1 AND password=$2",
    [email, password]
  );

  if (result.rows.length > 0) {
    req.session.adminId = result.rows[0].admin_id;
    res.redirect("/dashboard/admin");
  } else {
    res.redirect("/login/admin?error=Invalid admin credentials");
  }
});



// resolver signup and login---------------------------------------------

app.post("/signup/resolver", async (req, res) => {
  const { name, role, phone, email, password } = req.body;

  if (!name || !role || !phone || !email || !password) {
    return res.redirect("/login/resolver?error=Please fill all fields");
  }

  await pool.query(
    "INSERT INTO resolvers (name, role, phone, email, password) VALUES ($1,$2,$3,$4,$5)",
    [name, role, phone, email, password]
  );

  res.redirect("/login/resolver?success=Resolver registered successfully");
});

app.post("/login/resolver", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM resolvers WHERE email=$1 AND password=$2",
    [email, password]
  );

  if (result.rows.length > 0) {
    req.session.resolverId = result.rows[0].resolver_id; 
    res.redirect("/dashboard/resolver");
  } else {
    res.redirect("/login/resolver?error=Invalid resolver credentials");
  }
});


// user dashboard--------------------------------------------------------------
app.get("/dashboard/user", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login/user");
  }

  const result = await pool.query(`
    SELECT 
      i.*,
      s.solution_text,
      s.resolved_at,
      r.name AS resolver_name
    FROM issues i
    LEFT JOIN solutions s ON i.issue_id = s.issue_id
    LEFT JOIN resolvers r ON s.resolver_id = r.resolver_id
    WHERE i.user_id = $1
    ORDER BY i.created_at DESC
  `, [req.session.userId]);

  res.render("dashboard/user", {
    issues: result.rows
  });
});

app.post("/user/acknowledge", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login/user");

  const { issue_id } = req.body;

  await pool.query(
    "UPDATE issues SET user_acknowledged=true WHERE issue_id=$1 AND user_id=$2",
    [issue_id, req.session.userId]
  );

  res.redirect("/dashboard/user");
});

app.post("/user/issue", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login/user");

  const { title, description, category } = req.body;

  await pool.query(
    "INSERT INTO issues (user_id,title,description,category) VALUES ($1,$2,$3,$4)",
    [req.session.userId, title, description, category]
  );

  res.redirect("/dashboard/user");
});

app.get("/logout", (req,res)=>{
  req.session.destroy(()=>{
    res.redirect("/");
  });
});



// admin dashboard-------------------------------------------------------------

app.get("/dashboard/admin", async (req, res) => {

  const issues = await pool.query(`
    SELECT 
      i.issue_id,
      i.title,
      i.description,
      i.category,
      i.status,
      i.created_at,
      u.name AS username
    FROM issues i
    JOIN users u ON i.user_id = u.user_id
    ORDER BY i.created_at DESC
  `);

  const assignableIssues = await pool.query(`
    SELECT 
      i.issue_id,
      i.title
    FROM issues i
    LEFT JOIN issue_assignment ia ON i.issue_id = ia.issue_id
    WHERE ia.issue_id IS NULL
    ORDER BY i.created_at DESC
  `);

  const resolvers = await pool.query(`
    SELECT resolver_id, name, role 
    FROM resolvers
  `);

  res.render("dashboard/admin", {
    issues: issues.rows,
    assignableIssues: assignableIssues.rows,
    resolvers: resolvers.rows,
    success: req.query.success || null
  });
});

app.post("/admin/assign", async (req, res) => {
  const { issue_id, resolver_id } = req.body;

  const alreadyAssigned = await pool.query(
    "SELECT 1 FROM issue_assignment WHERE issue_id=$1",
    [issue_id]
  );

  if (alreadyAssigned.rowCount > 0) {
    return res.redirect(
      "/dashboard/admin?success=" +
      encodeURIComponent("Issue already assigned to a resolver")
    );
  }

  const admin = await pool.query(
    "SELECT name FROM admins WHERE admin_id=$1",
    [req.session.adminId]
  );

  const issue = await pool.query(
    "SELECT title FROM issues WHERE issue_id=$1",
    [issue_id]
  );

  const resolver = await pool.query(
    "SELECT name, role FROM resolvers WHERE resolver_id=$1",
    [resolver_id]
  );

  const adminName = admin.rows[0].name;
  const issueTitle = issue.rows[0].title;
  const resolverName = resolver.rows[0].name;
  const resolverRole = resolver.rows[0].role;

  await pool.query(
    "INSERT INTO issue_assignment (issue_id, resolver_id) VALUES ($1,$2)",
    [issue_id, resolver_id]
  );

  await pool.query(
    "UPDATE issues SET status='Assigned' WHERE issue_id=$1",
    [issue_id]
  );

  const message =
    `Admin (${adminName}) assigned issue (${issueTitle}) ` +
    `to Resolver (${resolverName} - ${resolverRole})`;

  await pool.query(
    "INSERT INTO status_log (issue_id,status,updated_by,remarks) VALUES ($1,'Assigned','Admin',$2)",
    [issue_id, message]
  );

  res.redirect(
    "/dashboard/admin?success=" +
    encodeURIComponent("Resolver assigned successfully")
  );
});



//resolver dashboard-----------------------------------------------------------

app.get("/dashboard/resolver", async (req, res) => {
  if (!req.session.resolverId) {
    return res.redirect("/login/resolver");
  }

  const issues = await pool.query(`
    SELECT 
      i.issue_id,
      i.title,
      i.description,
      i.category,
      i.status,
      i.created_at,
      u.name AS username,
      s.solution_id,
      s.solution_text
    FROM issue_assignment ia
    JOIN issues i ON ia.issue_id = i.issue_id
    JOIN users u ON i.user_id = u.user_id
    LEFT JOIN solutions s ON i.issue_id = s.issue_id
    WHERE ia.resolver_id = $1
    ORDER BY ia.assigned_at DESC
  `, [req.session.resolverId]);

  res.render("dashboard/resolver", {
    issues: issues.rows,
    success: req.query.success || null
  });
});

app.post("/resolver/solution/create", async (req, res) => {
  if (!req.session.resolverId) {
    return res.redirect("/login/resolver");
  }

  const { issue_id, solution_text } = req.body;

  await pool.query(
    `INSERT INTO solutions (issue_id, resolver_id, solution_text)
     VALUES ($1,$2,$3)`,
    [issue_id, req.session.resolverId, solution_text]
  );

  await pool.query(
    "UPDATE issues SET status='Resolved' WHERE issue_id=$1",
    [issue_id]
  );

  await pool.query(
    `INSERT INTO status_log (issue_id,status,updated_by,remarks)
     VALUES ($1,'Resolved','Resolver','Solution submitted')`,
    [issue_id]
  );

  res.redirect("/dashboard/resolver?success=Solution submitted successfully");
});

app.post("/resolver/solution/update", async (req, res) => {
  const { solution_id, solution_text, issue_id } = req.body;

  await pool.query(
    `UPDATE solutions SET solution_text=$1 WHERE solution_id=$2`,
    [solution_text, solution_id]
  );

  await pool.query(
    `INSERT INTO status_log (issue_id,status,updated_by,remarks)
     VALUES ($1,'Updated','Resolver','Solution updated')`,
    [issue_id]
  );

  res.redirect("/dashboard/resolver?success=Solution updated successfully");
});

app.post("/resolver/solution/delete", async (req, res) => {
  const { solution_id, issue_id } = req.body;

  await pool.query(
    "DELETE FROM solutions WHERE solution_id=$1",
    [solution_id]
  );

  await pool.query(
    "UPDATE issues SET status='Assigned' WHERE issue_id=$1",
    [issue_id]
  );

  await pool.query(
    `INSERT INTO status_log (issue_id,status,updated_by,remarks)
     VALUES ($1,'Assigned','Resolver','Solution deleted')`,
    [issue_id]
  );

  res.redirect("/dashboard/resolver?success=Solution deleted successfully");
});



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
