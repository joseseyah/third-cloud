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

/**
 * Calculates midnight time based on Maghrib and next day's Fajr times.
 * @param {string} maghrib - Maghrib time in HH:mm format.
 * @param {string} fajrNextDay - Fajr time for the next day in HH:mm format.
 * @return {string} Midnight time in HH:mm format.
 */
function calculateMidnight(maghrib, fajrNextDay) {
  const maghribTime = new Date(`1970-01-01T${maghrib}:00Z`);
  const fajrTime = new Date(`1970-01-02T${fajrNextDay}:00Z`);
  const midnight = new Date((maghribTime.getTime() + fajrTime.getTime()) / 2);
  return midnight.toISOString().slice(11, 16); // Return HH:mm format
}

/**
 * Calculates the last third of the night
 * @param {string} maghrib - Maghrib time in HH:mm format.
 * @param {string} fajrNextDay - Fajr time for the next day in HH:mm format.
 * @return {string} Last third of the night time in HH:mm format.
 */
function calculateLastThird(maghrib, fajrNextDay) {
  const maghribTime = new Date(`1970-01-01T${maghrib}:00Z`);
  const fajrTime = new Date(`1970-01-02T${fajrNextDay}:00Z`);
  const duration = fajrTime - maghribTime;
  const lastThirdStart = new Date(fajrTime.getTime() - duration / 3);
  return lastThirdStart.toISOString().slice(11, 16); // Return HH:mm format
}

// Cloud Function to fetch and process prayer times
exports.fetchLondonUnifiedTimetable = functions.pubsub
    .schedule("0 0 * * *") // Runs every midnight
    .timeZone("Europe/London") // Set to London time
    .onRun(async () => {
      try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const todayDate = today.toISOString().split("T")[0];
        const tomorrowDate = tomorrow.toISOString().split("T")[0];

        const url = `https://www.londonprayertimes.com/api/times/?format=json&key=f31cd22f-be6a-4410-bd20-cdd3b9923cff&date=${todayDate},${tomorrowDate}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const data = await response.json();

        // Extract today's and tomorrow's data
        const todayData = data.find((entry) => entry.date === todayDate);
        const tomorrowData = data.find((entry) => entry.date === tomorrowDate);

        if (!todayData || !tomorrowData) {
          throw new Error("Failed to retrieve both PTs");
        }

        const maghribTime = todayData.magrib;
        const fajrTimeNextDay = tomorrowData.fajr;
        const midnight = calculateMidnight(maghribTime, fajrTimeNextDay);
        const lastThird = calculateLastThird(maghribTime, fajrTimeNextDay);

        // Format data
        const formattedData = [
          {
            d_date: todayData.date,
            fajr_begins: todayData.fajr,
            fajr_jamah: todayData.fajr_jamat || "",
            sunrise: todayData.sunrise,
            zuhr_begins: todayData.dhuhr,
            zuhr_jamah: todayData.dhuhr_jamat || "",
            asr_mithl_1: todayData.asr,
            asr_mithl_2: todayData.asr_2 || todayData.asr,
            maghrib_begins: todayData.magrib,
            isha_begins: todayData.isha,
            isha_jamah: todayData.isha_jamat || "",
            midnight: midnight,
            last_third: lastThird,
            hijri_date: "0",
            is_ramadan: "0",
          },
        ];

        // Save to Firestore
        await db
            .collection("Mosques")
            .doc("East London Mosque")
            .set({
              city: "London",
              prayerTimes: formattedData,
            }, {merge: true});

        console.log("Prayer times updated ELM");
      } catch (error) {
        console.error("Error fetching or storing prayer times:", error);
      }
    });


