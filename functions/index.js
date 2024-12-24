const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// Get the current month and year
const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

// Cloud Function to fetch monthly prayer times
exports.updatePrayerTimes = functions
    .pubsub.schedule("every 24 hours").onRun(async (context) => {
      try {
        // Fetch all cities from Firestore
        const snapshot = await db.collection("locations").get();
        const locations = snapshot.docs.map((doc) => doc.data());

        for (const location of locations) {
          const {city, country} = location;

          try {
            const url = `https://api.aladhan.com/v1/calendarByCity/${currentYear}/${currentMonth}?city=${city}&country=${country}`;
            const response = await fetch(url);
            const data = await response.json();

            // Store the monthly prayer times in Firestore for the city
            await db.collection("prayerTimes").doc(city).set({
              city,
              country,
              month: currentMonth,
              year: currentYear,
              prayerTimes: data.data,
            });

            console.log(`Prayer times for ${city} updated successfully`);
          } catch (error) {
            console.error(`Failed to update for ${city}: ${error}`);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch locations: ${error}`);
      }
      return null;
    });

// Cloud Function to add a new city
exports.addCity = functions.https.onCall(async (data, context) => {
  const {city, country} = data;

  if (!city || !country) {
    throw new functions.https.HttpsError("invalid", "City flag are required");
  }

  try {
    // Check if the city already exists in the "locations" Firestore collection
    const cityDoc = await db.collection("locations").doc(city).get();

    if (cityDoc.exists) {
      console.log(`City ${city}, ${country} already exists in the database.`);
      return {success: false, message: `City ${city} already exists.`};
    }

    // Add the new city to the Firestore "locations" collection
    await db.collection("locations").doc(city).set({city, country});
    console.log(`City ${city}, ${country} added to locations.`);

    // Fetch prayer times for the new city
    const url = `https://api.aladhan.com/v1/calendarByCity/${currentYear}/${currentMonth}?city=${city}&country=${country}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.data) {
      throw new Error("Failed to fetch prayer times from API");
    }

    // Save the prayer times to Firestore
    await db.collection("prayerTimes").doc(city).set({
      city,
      country,
      month: currentMonth,
      year: currentYear,
      prayerTimes: data.data,
    });

    console.log(`City ${city}, ${country} added successfully`);
    return {success: true, message: `City ${city} added successfully.`};
  } catch (error) {
    console.error(`Failed add city/fetch PT: ${error}`);
    throw new functions
        .https.HttpsError("internal", `Failed add city: ${error.message}`);
  }
});


exports.updateManchesterISOCPrayerTimes = functions.pubsub
    .schedule("every 24 hours").onRun(async (context) => {
      const url = "http://isoc.great-site.net";
      try {
        // Fetch prayer times from the API
        const response = await fetch(url);
        const data = await response.json();

        // Ensure the response contains the expected fields
        if (!data.fajr ||
          !data.dhuhr ||
          !data.asr ||
          !data.maghrib ||
          !data.isha ||
          !data.date) {
          throw new Error("Invalid data structure from the API");
        }
        // Store the prayer times in Firestore for Manchester ISOC
        await db.collection("Mosques").doc("Manchester Isoc").set({
          city: "Manchester",
          mosque: "ISOC",
          date: data.date,
          prayerTimes: {
            fajr: data.fajr,
            sunrise: data.sunrise,
            dhuhr: data.dhuhr,
            asr: data.asr,
            maghrib: data.maghrib,
            isha: data.isha,
          },
        });

        console.log("Prayer times for Manchester ISOC updated successfully");
      } catch (error) {
        console.error(`Failed to update prayer times: ${error}`);
      }

      return null;
    });
