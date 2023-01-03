import fs from 'fs'
import path from 'path'

function makeNativeHeaders() {
  // Grab the API key:
  let apiKey = 'Error: Set up env.json & re-run scrips/makeNativeHeaders.js'
  try {
    apiKey = require('../env.json').AIRBITZ_API_KEY
  } catch (e) {
    console.log(apiKey)
  }

  // Grab the push notification server:
  let pushServer = 'https://push2.edge.app'
  try {
    pushServer = require('../src/theme/appConfig.js').notificationServers[0]
  } catch (e) {}

  const iosPath = path.join(__dirname, '../ios/EdgeApiKey.swift')
  const iosSource = `/* auto-generated by scrips/makeNativeHeaders.js */

public class EdgeApiKey {
  public static let apiKey = "${apiKey}"
}
`
  fs.writeFileSync(iosPath, iosSource)

  const androidPath = path.join(__dirname, '../android/app/src/main/java/co/edgesecure/app/EdgeApiKey.java')
  const androidSource = `/* auto-generated by scrips/makeNativeHeaders.js */
package co.edgesecure.app;

public class EdgeApiKey {
  public static final String apiKey = "${apiKey}";
  public static final String pushServer = "${pushServer};"
}
`
  fs.writeFileSync(androidPath, androidSource)
}

try {
  makeNativeHeaders()
} catch (e) {
  console.log(e)
}
