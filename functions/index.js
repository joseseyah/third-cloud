// const functions = require("firebase-functions");
// const admin = require("firebase-admin");
// const fetch = require("node-fetch");

// admin.initializeApp();
// const db = admin.firestore();

// // List of cities and countries
// const locations = [
//   {city: "London", country: "GB"},
//   {city: "Dubai", country: "AE"},
//   {city: "Makkah", country: "SA"},
//   {city: "Singapore", country: "SG"},
//   {city: "Stockport", country: "GB"},
//   {city: "Manchester", country: "GB"},
//   {city: "Dipolog", country: "PH"},
//   {city: "Jeddah", country: "SA"},
//   {city: "Medina", country: "SA"},
//   {city: "Manila", country: "PH"},
//   {city: "Paris", country: "FR"},
//   {city: "New York", country: "USA"},
// ];

// // Get the current month and year
// const currentMonth = new Date().getMonth() + 1;
// const currentYear = new Date().getFullYear();

// // Cloud Function to fetch monthly prayer times
// exports.updatePrayerTimes = functions.pubsub.schedule("every 24 hours")
//     .onRun(async (context) => {
//       for (const location of locations) {
//         const {city, country} = location;
//         try {
//           const url = `https://api.aladhan.com/v1/calendarByCity/${currentYear}/${currentMonth}?city=${city}&country=${country}`;
//           const response = await fetch(url);
//           const data = await response.json();

//           // Store the monthly prayer times in Firestore for the city
//           await db.collection("prayerTimes").doc(city).set({
//             city: city,
//             country: country,
//             month: currentMonth,
//             year: currentYear,
//             prayerTimes: data.data,
//           });

//           console.log(`Prayer times for ${city}, ${country} successfully`);
//         } catch (error) {
//           console.error(`Fail to update PT for ${city}, ${country}: ${error}`);
//         }
//       }
//       return null;
//     });


const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// Get the current month and year
const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

// Cloud Function to fetch monthly prayer times
exports.updatePrayerTimes = functions.pubsub.schedule("every 24 hours")
    .onRun(async (context) => {
        try {
            // Fetch all cities from Firestore
            const snapshot = await db.collection("locations").get();
            const locations = snapshot.docs.map(doc => doc.data());

            for (const location of locations) {
                const { city, country } = location;
                try {
                    const url = `https://api.aladhan.com/v1/calendarByCity/${currentYear}/${currentMonth}?city=${city}&country=${country}`;
                    const response = await fetch(url);
                    const data = await response.json();

                    // Store the monthly prayer times in Firestore for the city
                    await db.collection("prayerTimes").doc(city).set({
                        city: city,
                        country: country,
                        month: currentMonth,
                        year: currentYear,
                        prayerTimes: data.data,
                    });

                    console.log(`Prayer times for ${city}, ${country} updated successfully`);
                } catch (error) {
                    console.error(`Failed to update PT for ${city}, ${country}: ${error}`);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch locations: ${error}`);
        }
        return null;
    });

// Cloud Function to add a new city
exports.addCity = functions.https.onCall(async (data, context) => {
    const { city, country } = data;

    if (!city || !country) {
        throw new functions.https.HttpsError("invalid-argument", "City and country are required");
    }

    try {
        // Add the new city to the Firestore locations collection
        await db.collection("locations").doc(city).set({ city, country });
        console.log(`City ${city}, ${country} added successfully`);
        return { success: true, message: `City ${city}, ${country} added successfully` };
    } catch (error) {
        console.error(`Failed to add city: ${error}`);
        throw new functions.https.HttpsError("internal", `Failed to add city: ${error.message}`);
    }
});

