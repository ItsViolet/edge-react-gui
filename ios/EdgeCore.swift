import Foundation

@objc
public class EdgeCore: NSObject {
  @objc
  public func fetchPendingLogins(completion: @escaping ([NSString]?) -> Void) {
    do {
      let decoder = JSONDecoder()
      let encoder = JSONEncoder()

      // List the logins folder:
      let fs = FileManager.default
      guard let documentUrl = fs.urls(for: .documentDirectory, in: .userDomainMask).first else {
        return completion(nil)
      }
      let loginsUrl = documentUrl.appendingPathComponent("logins").absoluteURL
      let files = try fs.contentsOfDirectory(
        at: loginsUrl, includingPropertiesForKeys: nil, options: [])

      // Load the files:
      var loginIds: [String: String] = [:]
      for file in files {
        if let data = try? Data(contentsOf: file),
          let loginStash = try? decoder.decode(LoginStash.self, from: data)
        {
          if loginStash.loginAuthBox != nil {
            loginIds[loginStash.loginId] = loginStash.username
          }
        }
      }

      // Bail out if there are no logged-in users:
      if loginIds.count == 0 { return completion([]) }

      // Prepare our payload:
      var body = LoginRequestBody()
      body.loginIds = Array.init(loginIds.keys)

      // Prepare our request:
      guard let url = URL(string: "https://login.edge.app/api/v2/messages") else {
        return completion(nil)
      }
      var request = URLRequest(url: url)
      request.httpBody = try encoder.encode(body)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("Token \(EdgeApiKey.apiKey)", forHTTPHeaderField: "Authorization")

      // Perform the request:
      let task = URLSession.shared.dataTask(with: request) { data, response, error in
        if error != nil { return completion(nil) }
        if let data = data,
          let body = try? decoder.decode(LoginResponseBody.self, from: data),
          let results = body.results
        {
          var usernames: [NSString] = []
          for result in results {
            if result.otpResetPending == true || result.pendingVouchers?.count ?? 0 > 0 {
              if let username = loginIds[result.loginId] {
                usernames.append(NSString(string: username))
              }
            }
          }
          completion(usernames)
        } else {
          completion(nil)
        }
      }

      task.resume()
    } catch {
      return completion(nil)
    }
  }

  private struct EdgeBox: Codable {
    // TODO
  }

  private struct EdgePendingVoucher: Codable {
    // TODO
  }

  private struct LoginRequestBody: Codable {
    var loginIds: [String]?
  }

  private struct LoginResponseBody: Codable {
    var results: [MessagesPayload]?
    var status_code: Int
    var message: String
  }

  private struct LoginStash: Codable {
    var loginId: String
    var username: String
    var loginAuthBox: EdgeBox?
  }

  private struct MessagesPayload: Codable {
    var loginId: String
    var otpResetPending: Bool?
    var pendingVouchers: [EdgePendingVoucher]?
    var recovery2Corrupt: Bool?
  }
}
