require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();




// app.use(cors());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true // If you are using cookies
}));
app.use(express.json());


// app.use(cors());
// app.use(express.json());




// console.log(JWT_SECRET)
const uri = "mongodb+srv://bldm:bldm1234@cluster0.gvvjm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// const client = new MongoClient(uri, {
//     serverApi: {
//         version: ServerApiVersion.v1,
//         strict: true,
//         deprecationErrors: true,
//     },
// });




let users, quizCollection, scores;

async function connectDB() {
    await client.connect();
    const db = client.db("quizApp");
    users = db.collection("users");
    quizCollection = db.collection("questions");
    scores = db.collection("scores");
}
connectDB().catch(console.error);

// Auth middleware
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.sendStatus(401);
    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        next();
    } catch {
        res.sendStatus(403);
    }
}






// Register
app.post("/register", async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).send("Missing fields");

    const exists = await users.findOne({ username });
    if (exists) return res.status(400).send("User already exists");

    const hashed = await bcrypt.hash(password, 10);
    await users.insertOne({ username, password: hashed, role: role || "user" });
    res.send("User registered");
});

// Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await users.findOne({ username });
    if (!user) return res.status(400).send("Invalid credentials");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send("Invalid credentials");

    const token = jwt.sign(
        { username, role: user.role },
        JWT_SECRET,
        { expiresIn: "1h" }
    );
    res.json({ token, username });
});

// Get quiz questions for users (no answers)
app.get("/questions", async (req, res) => {
    const questions = await quizCollection.find({}).toArray();
    const safeQuestions = questions.map(({ answer, ...q }) => q);
    res.json(safeQuestions);
});

// Submit quiz answers, calculate result, log score
app.post("/submit", verifyToken, async (req, res) => {
    const { answers } = req.body;

    const allQuestions = await quizCollection.find({}).toArray();
    const result = allQuestions.map((q, i) => {
        const userAnswer = answers[i]?.toString().trim().toLowerCase() || "";
        const correctAnswer = q.answer.toString().trim().toLowerCase();
        const correct = userAnswer === correctAnswer;
        return {
            question: q.question,
            correct,
            correctAnswer: q.answer,
        };
    });

    const score = result.filter((r) => r.correct).length;

    await scores.insertOne({
        username: req.user.username,
        score,
        date: new Date(),
    });

    res.json(result);
});

// Leaderboard (top 10 users by total score)
app.get("/scoreboard", verifyToken, async (req, res) => {
    const leaderboard = await scores
        .aggregate([
            { $group: { _id: "$username", totalScore: { $sum: "$score" } } },
            { $sort: { totalScore: -1 } },
            { $limit: 10 },
        ])
        .toArray();

    res.json(leaderboard);
});

// Admin - Add new question
app.post("/admin/upload", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");

    const { question, type, options, answer, level } = req.body;
    await quizCollection.insertOne({ question, type, options, answer, level });
    res.send("Question added");
});

// Admin - Get all questions with answers
app.get("/admin/questions", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");

    const questions = await quizCollection.find({}).toArray();
    res.json(questions);
});

// Admin - Update question
app.put("/admin/questions/:id", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");

    const { id } = req.params;
    const { question, type, options, answer } = req.body;
    await quizCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { question, type, options, answer } }
    );
    res.send("Question updated");
});

// Admin - Delete question
app.delete("/admin/questions/:id", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");

    const { id } = req.params;
    await quizCollection.deleteOne({ _id: new ObjectId(id) });
    res.send("Question deleted");
});

app.get("/", (req, res) => {
    res.send("QUIZ SERVER IS RUNNING");
});


app.listen(PORT, () => {
    console.log("Server running on port 500");
});
