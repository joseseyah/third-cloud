const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// List of cities and countries
const locations = [
  {city: "London", country: "GB"},
  {city: "Dubai", country: "AE"},
  {city: "Makkah", country: "SA"},
  {city: "Singapore", country: "SG"},
  {city: "Stockport", country: "GB"},
  {city: "Manchester", country: "GB"},
  {city: "Dipolog", country: "PH"},
  {city: "Jeddah", country: "SA"},
  {city: "Medina", country: "SA"},
  {city: "Manila", country: "PH"},
  {city: "Paris", country: "FR"},
  {city: "New York", country: "USA"},
];

// Get the current month and year
const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

// Cloud Function to fetch monthly prayer times
exports.updatePrayerTimes = functions.pubsub.schedule("every 24 hours")
    .onRun(async (context) => {
      for (const location of locations) {
        const {city, country} = location;
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

          console.log(`Prayer times for ${city}, ${country} successfully`);
        } catch (error) {
          console.error(`Fail to update PT for ${city}, ${country}: ${error}`);
        }
      }
      return null;
    });
