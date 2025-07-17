// --- Firebase Configuration (REPLACE WITH YOUR ACTUAL CONFIG) ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth(); // For admin login later

// --- DOM Elements ---
const defectReportForm = document.getElementById('defectReportForm');
const loadingSpinner = document.getElementById('loadingSpinner');
const thankYouSection = document.getElementById('thankYouSection');
const publicToggle = document.getElementById('publicToggle');
const staffToggle = document.getElementById('staffToggle');
const imageUploadInput = document.getElementById('imageUpload');
const imageUploadProgress = document.getElementById('imageUploadProgress');
const imageUploadSuccess = document.getElementById('imageUploadSuccess');

// Snapshot Analysis elements
const totalActiveReportsSpan = document.getElementById('totalActiveReports');
const criticalIssuesTodaySpan = document.getElementById('criticalIssuesToday');
const defectsByTypeChartCtx = document.getElementById('defectsByTypeChart').getContext('2d');
const lastUpdatedTimestampSpan = document.getElementById('lastUpdatedTimestamp');

let defectsByTypeChart; // To hold our Chart.js instance

// --- Event Listeners ---

// Toggle buttons for Public/Staff
publicToggle.addEventListener('click', () => {
    publicToggle.classList.add('active');
    staffToggle.classList.remove('active');
    // For now, this just keeps us on the public page.
    // Later, staffToggle will redirect to admin.html
});

staffToggle.addEventListener('click', () => {
    publicToggle.classList.remove('active');
    staffToggle.classList.add('active');
    // Redirect to admin login page
    window.location.href = 'admin.html';
});

// Form Submission Handler
defectReportForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission

    // Show loading spinner and hide thank you section
    loadingSpinner.classList.remove('hidden');
    thankYouSection.classList.add('hidden');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); // Auto-scroll to spinner

    const formData = new FormData(defectReportForm);
    const reportData = {};
    for (let [key, value] of formData.entries()) {
        reportData[key] = value;
    }

    reportData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
    reportData.status = 'Reported'; // Initial status

    let imageUrl = null;
    const imageFile = imageUploadInput.files[0];

    // Handle image upload if a file is selected
    if (imageFile) {
        const storageRef = storage.ref();
        const imageRef = storageRef.child(`images/${Date.now()}_${imageFile.name}`);
        const uploadTask = imageRef.put(imageFile);

        uploadTask.on('state_changed',
            (snapshot) => {
                // Observe state change events such as progress, pause, and resume
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                imageUploadProgress.style.width = `${progress}%`;
                console.log('Upload is ' + progress + '% done');
            },
            (error) => {
                // Handle unsuccessful uploads
                console.error("Image upload failed:", error);
                alert("Image upload failed. Please try again.");
                loadingSpinner.classList.add('hidden');
            },
            async () => {
                // Handle successful uploads on complete
                imageUrl = await uploadTask.snapshot.ref.getDownloadURL();
                reportData.imageUrl = imageUrl;
                imageUploadSuccess.textContent = 'Upload successful!';
                imageUploadSuccess.style.display = 'block';
                await saveReportToFirestore(reportData);
            }
        );
    } else {
        await saveReportToFirestore(reportData);
    }
});

// Function to save report to Firestore
async function saveReportToFirestore(reportData) {
    try {
        // AI Simulation: Classify and Recommend (Replace with actual AI API call later)
        const aiAnalysis = simulateAIAnalysis(reportData);
        reportData.aiSeverity = aiAnalysis.severity;
        reportData.aiRecommendation = aiAnalysis.recommendation;

        // Check for duplicate entry (simple check for now based on description and kilometerPost)
        const querySnapshot = await db.collection('reports')
            .where('description', '==', reportData.description)
            .where('kilometerPost', '==', reportData.kilometerPost)
            .limit(1)
            .get();

        if (!querySnapshot.empty) {
            alert('This report seems to have been already entered. Thank you!');
            loadingSpinner.classList.add('hidden');
            return;
        }

        await db.collection('reports').add(reportData);
        alert('Report submitted successfully!');
        defectReportForm.reset(); // Clear the form
        imageUploadProgress.style.width = '0%'; // Reset upload progress
        imageUploadSuccess.style.display = 'none'; // Hide success message

        // Hide spinner and show thank you section
        loadingSpinner.classList.add('hidden');
        thankYouSection.classList.remove('hidden');
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); // Auto-scroll to display

    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Error submitting report. Please try again.");
        loadingSpinner.classList.add('hidden');
    }
}

// --- Real-time Data Visualization (Public View) ---
// Listen for real-time updates from Firestore
db.collection('reports').orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
        const reports = [];
        snapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });
        updatePublicDashboard(reports);
    }, (error) => {
        console.error("Error fetching real-time reports:", error);
    });

function updatePublicDashboard(reports) {
    let totalActive = reports.filter(r => r.status !== 'Resolved' && r.status !== 'Deferred').length;
    let criticalToday = reports.filter(r => r.aiSeverity === 'Critical' && isToday(r.timestamp?.toDate())).length;

    totalActiveReportsSpan.textContent = totalActive;
    criticalIssuesTodaySpan.textContent = criticalToday;
    lastUpdatedTimestampSpan.textContent = new Date().toLocaleString();

    // Prepare data for Defects by Type chart
    const defectCounts = {};
    reports.forEach(report => {
        const type = report.defectType || 'Unknown';
        defectCounts[type] = (defectCounts[type] || 0) + 1;
    });

    const chartLabels = Object.keys(defectCounts);
    const chartData = Object.values(defectCounts);

    if (defectsByTypeChart) {
        defectsByTypeChart.data.labels = chartLabels;
        defectsByTypeChart.data.datasets[0].data = chartData;
        defectsByTypeChart.update();
    } else {
        defectsByTypeChart = new Chart(defectsByTypeChartCtx, {
            type: 'pie',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9900', '#A52A2A', '#008000'
                    ],
                    hoverBackgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9900', '#A52A2A', '#008000'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Defects by Type'
                    }
                }
            }
        });
    }
}

// Helper function to check if a date is today
function isToday(someDate) {
    if (!someDate) return false;
    const today = new Date();
    return someDate.getDate() === today.getDate() &&
           someDate.getMonth() === today.getMonth() &&
           someDate.getFullYear() === today.getFullYear();
}

// --- AI Simulation Function (Placeholder for actual Generative AI API integration) ---
function simulateAIAnalysis(report) {
    let severity = 'Medium';
    let recommendation = 'Standard maintenance required.';

    const lowerDescription = report.description.toLowerCase();

    // Simple keyword-based AI classification
    if (lowerDescription.includes('large pothole') || lowerDescription.includes('collapsed culvert') || lowerDescription.includes('major crack') || lowerDescription.includes('impassable')) {
        severity = 'Critical';
        recommendation = 'Immediate attention required: severe hazard.';
    } else if (lowerDescription.includes('significant crack') || lowerDescription.includes('blocked drainage') || lowerDescription.includes('medium pothole')) {
        severity = 'High';
        recommendation = 'Urgent repair needed within 1 week.';
    } else if (lowerDescription.includes('small crack') || lowerDescription.includes('minor erosion') || lowerDescription.includes('vegetation overgrowth')) {
        severity = 'Low';
        recommendation = 'Scheduled maintenance suggested.';
    }

    if (report.defectType === 'Encroachment') {
        severity = 'High';
        recommendation = 'Legal and enforcement team review required.';
    } else if (report.defectType === 'Illegal Signpost') {
        severity = 'Medium';
        recommendation = 'Signpost removal team dispatch.';
    }

    return { severity, recommendation };
}

// Initial display setup
loadingSpinner.classList.add('hidden'); // Ensure spinner is hidden initially
thankYouSection.classList.add('hidden'); // Ensure thank you section is hidden initially