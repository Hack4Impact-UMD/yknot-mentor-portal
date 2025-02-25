const functions = require("firebase-functions");
const Busboy = require("busboy");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const cors = require("cors")({ origin: true });
const axios = require("axios");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const OAuth2 = google.auth.OAuth2;
admin.initializeApp(functions.config().firebase);
dotenv.config();

const oauth2Client = new OAuth2(
  process.env.CLIENT_ID, // ClientID
  process.env.CLIENT_SECRET, // Client Secret
  "https://developers.google.com/oauthplayground" // Redirect URL
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const getAccessToken = async () => {
  await oauth2Client
    .getAccessToken()
    .then((token) => {
      return token;
    })
    .catch((error) => {
      console.log(error);
      return "Error";
    });
};

const accessToken = getAccessToken();
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: "yknotincmentors@gmail.com",
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
    accessToken: accessToken,
  },
  tls: {
    rejectUnauthorized: false,
  },
});
const menteeFormId = "212736766290159";
const siteUrl = "https://yknot-ats.web.app/";
/* 
Sets a user's role. Takes an object as a parameter that should contain a uid field
and a role field. This function can only be called by a user with admin status.
*/
exports.setUserRole = functions.https.onCall((data, context) => {
  const auth = admin.auth();
  auth
    .verifyIdToken(data.idToken)
    .then((claims) => {
      if (data.uid != null && data.role != null && claims.role == "admin") {
        auth.setCustomUserClaims(data.uid, { role: data.role });
      } else {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only an admin user can change roles"
        );
      }
    })
    .catch((error) => {
      throw new functions.https.HttpsError("unknown", error);
    });
});

/*
Retrieves user application from JotForm API
*/
exports.getApplicantForm = functions.https.onCall((data, context) => {
  const apiKey = functions.config().secret.jotform_key;
  const url = `https://api.jotform.com/submission/${data.id}?apiKey=${apiKey}`;
  return new Promise((resolve, reject) => {
    const auth = admin.auth();
    auth.verifyIdToken(data.idToken).then((claims) => {
      axios
        .get(url)
        .then((response) => response.data)
        .then((data) => {
          return resolve(data);
        })
        .catch((error) => {
          console.log(data);
          console.log(url);
          functions.logger.log(error);
          return reject(error);
        });
    });
  });
});

/*
Gets a mentee's info by their id from their Jotform submission.
*/
exports.getMenteeForm = functions.https.onCall((data, context) => {
  const apiKey = functions.config().secret.jotform_key;
  const url = `https://api.jotform.com/submission/${data.id}?apiKey=${apiKey}`;

  return new Promise((resolve, reject) => {
    const auth = admin.auth();
    auth.verifyIdToken(data.idToken).then((claims) => {
      axios
        .get(url)
        .then((response) => response.data)
        .then((data) => {
          return resolve(data);
        })
        .catch((error) => {
          return reject("API error");
        });
    });
  });
});

/*
Retrieves mentee forms from JotForm API
Takes a user idToken for authentication
Requires admin account permission
*/
exports.getMenteeForms = functions.https.onCall((data, context) => {
  const apiKey = functions.config().secret.jotform_key;
  const url = `https://api.jotform.com/form/${menteeFormId}/submissions?apiKey=${apiKey}`;

  return new Promise((resolve, reject) => {
    admin
      .auth()
      .verifyIdToken(data.idToken)
      .then((claims) => {
        if (claims.role == "admin")
          axios
            .get(url)
            .then((response) => response.data)
            .then((data) => {
              return resolve(data);
            })
            .catch((error) => {
              return reject("API error");
            });
      });
  });
});

exports.newSubmission = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method != "POST") {
      return res.status(405).end();
    }

    const busboy = new Busboy({ headers: req.headers });

    const fields = [];
    try {
      busboy.on("field", (field, val) => {
        fields[field] = val;
      });
    } catch (error) {
      console.log(error);
    }

    busboy.on("finish", () => {
      const data = JSON.parse(fields["rawRequest"]);
      const submissionId = fields["submissionID"];
      const firstName = data["q3_nameOf3"]["first"];
      const lastName = data["q3_nameOf3"]["last"];
      const email = data["q7_email"];
      const phoneNumber = data["q6_phoneNumber"]["full"];
      const agePreference = data["q9_name9"];
      const interestsAndHobbies = data["q40_name40"];
      const bestDescribes = data["q41_name41"];
      const canHaveManyMentees = data["q39_canYou"];

      const user = {
        submission_id: submissionId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone_number: phoneNumber,
        stage: "NEW",
        age_preference: agePreference,
        interests_hobbies: interestsAndHobbies,
        best_describes: bestDescribes,
        can_have_multiple_mentees: canHaveManyMentees,
        createdAt: new Date().getTime(),
      };

      const db = admin.firestore();

      db.collection("applicants")
        .doc(submissionId)
        .set(user)
        .then(() => {
          console.log("Success");
          return res.status(200).end();
        })
        .catch((error) => {
          console.log(error);
          return res.status(400).end();
        });
    });

    busboy.end(req.rawBody);
  });
});

exports.getCalendlyLink = functions.https.onCall((data, context) => {
  const url = `https://api.calendly.com/scheduling_links`;
  const apiKey = functions.config().secret.calendly_key;

  return new Promise((resolve, reject) => {
    axios
      .post(
        url,
        '{"max_event_count":1,"owner":"https://api.calendly.com/event_types/8f5c528a-2aa3-4dd4-8405-40c9df48f404","owner_type":"EventType"}',
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )
      .then((response) => response.data)
      .then((data) => {
        return resolve(data);
      })
      .catch((error) => {
        return reject(error);
      });
  });
});

exports.getScheduledInterview = functions.https.onCall((data, context) => {
  const orgURI =
    "https%3A%2F%2Fapi.calendly.com%2Forganizations%2F820c1dcf-5350-47e8-a535-8ca2999f96d4";
  const url = `https://api.calendly.com/scheduled_events?organization=${orgURI}&invitee_email=${encodeURIComponent(
    data.email
  )}&status=active&sort=start_time%3Aasc&count=1`;
  const apiKey = functions.config().secret.calendly_key;

  return new Promise((resolve, reject) => {
    axios
      .get(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      })
      .then((response) => response.data)
      .then((data) => {
        return resolve(data);
      })
      .catch((error) => {
        return reject(error);
      });
  });
});

exports.sendBackgroundCheckEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Background Check Requested", // Subject line

      html: `
                <div>
                    <div style="max-width: 600px; margin: auto">
                        <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                        <br><br><br>
                        <p style="font-size: 16px">Welcome to the Y-KNOT family! As part of this process we require each person who becomes a mentor to pass a background check. Please complete the attached form. The document must be notarized and mailed to: <b>CJIS-Central Repository, P.O. Box 32708, Pikesville, Maryland 21282-2708</b>.<br>
                        <br>
                        Please expect to hear back within 30 days of submission (you and your potential employer will receive an email with the results).<br>
                        <br>
                        <br>
                        <br>
                        Y-KNOT Inc

                        </p>
                    <div>
                </div>
                
            `, // html body
      attachments: [
        {
          // utf-8 string as an attachment
          filename: "BackgroundCheckForm.pdf",
          path: "./assets/BackgroundCheckForm.pdf",
        },
      ],
    };

    transporter
      .sendMail(msg)
      .then((response) => {
        console.log(response);
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.newMenteeSubmission = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method != "POST") {
      return res.status(405).end();
    }

    const busboy = new Busboy({ headers: req.headers });

    const fields = [];
    try {
      busboy.on("field", (field, val) => {
        fields[field] = val;
      });
    } catch (error) {
      console.log(error);
    }

    busboy.on("finish", () => {
      const data = JSON.parse(fields["rawRequest"]);
      const submissionId = fields["submissionID"];
      const firstName = data["q103_childsName"]["first"];
      const lastName = data["q103_childsName"]["last"];

      const user = {
        submission_id: submissionId,
        matched: false,
        first_name: firstName,
        last_name: lastName,
      };

      const db = admin.firestore();

      db.collection("mentees")
        .doc(submissionId)
        .set(user)
        .then(() => {
          console.log("Success");
          return res.status(200).end();
        })
        .catch((error) => {
          console.log(error);
          return res.status(400).end();
        });
    });

    busboy.end(req.rawBody);
  });
});

/*
Sends an email to a mentor that they have been matched with a mentee.
Requires fields:
email
mentorName
menteeName
characteristic1
characteristic2
characteristic3
menteeAge
menteeGrade
menteeSchool
parentName
phoneNumber
menteeEmail
*/
exports.sendMenteeMatchEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (
      !req.query.email ||
      !req.query.menteeName ||
      !req.query.menteeAge ||
      !req.query.menteeGrade ||
      !req.query.menteeSchool ||
      !req.query.parentName ||
      !req.query.phoneNumber ||
      !req.query.menteeEmail ||
      !req.query.mentorName
    ) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Mentee Assignment", // Subject line

      html: `
            <div>
            <div style="max-width: 600px; margin: auto">
                <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                <br><br><br>
                <p style="font-size: 16px">Dear ${req.query.mentorName},<br>
                <br>
                You have been assigned ${
                  req.query.menteeName
                } as your mentee. ${
        req.query.characteristic1 ||
        req.query.characteristic2 ||
        req.query.characteristic3
          ? "This match has been made based on the following characteristics:"
          : ""
      }<br>
                <br>
                <ol>
                  ${
                    req.query.characteristic1 != "undefined"
                      ? `<li>${req.query.characteristic1}</li>`
                      : ""
                  }
                  ${
                    req.query.characteristic2 != "undefined"
                      ? `<li>${req.query.characteristic2}</li>`
                      : ""
                  }
                  ${
                    req.query.characteristic3 != "undefined"
                      ? `<li>${req.query.characteristic3}</li>`
                      : ""
                  }
                </ol>
                <br>
                As a mentor the expectation is that you contact the 
                mentee and family within 48 hours of receipt of this 
                notice.
                <br>
                <h4><b>Contact Info:</b></h4>
                Name: ${
                  req.query.menteeName != "undefined"
                    ? req.query.menteeName
                    : "[Not provided]"
                }<br>
                Age: ${
                  req.query.menteeAge != "undefined"
                    ? req.query.menteeAge
                    : "[Not provided]"
                }<br>
                Grade: ${
                  req.query.menteeGrad
                    ? req.query.menteeGrade
                    : "[Not provided]"
                }<br>
                School: ${
                  req.query.menteeSchool != "undefined"
                    ? req.query.menteeSchool
                    : "[Not provided]"
                }<br>
                Parent's Name: ${
                  req.query.parentName != "undefined"
                    ? req.query.parentName
                    : "[Not provided]"
                }<br>
                Phone Number: ${
                  req.query.phoneNumber
                    ? req.query.phoneNumber
                    : "[Not provided]"
                }<br>
                Email: ${
                  req.query.menteeEmail != "undefined"
                    ? req.query.menteeEmail
                    : "[Not provided]"
                }<br>
                <br>
                If you have any questions, comments or concerns please feel free to reach out 
                to us at <a href="mailto:mentors@yknotinc.org"> mentors@yknotinc.org</a>
                <br>
                <br>
                Thank you for being the best part of Y-KNOT Inc.
                </p>  
            <div>
        </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

/*
Sends an email from the mentors@yknot.org address to the same address to notify that a trainee
can now be made into a full mentor.
Requires the name of the mentee, called "name"
*/
exports.sendTrainingCompletedInternalEmail = functions.https.onRequest(
  (req, res) => {
    return cors(req, res, () => {
      if (!req.query.name) {
        res.status(400).send("invalid request");
        return;
      }

      const msg = {
        from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
        to: "mentors@yknotinc.org", // list of receivers
        subject: "Y-KNOT Mentor Training Complete", // Subject line

        html: `
                <div>
                    <div style="max-width: 600px; margin: auto">
                        <p>
                        ${req.query.name} has completed their mentor training. <br>
                        They can now be made a mentor in the assignment tab in the administrator dashboard.
                        </p>
                    </div>
                </div>
            `, // html body
      };

      transporter
        .sendMail(msg)
        .then(() => {
          console.log("message sent");
          res.status(200).send("Email Sent");
        })
        .catch((error) => {
          console.log(error);
          res.send(400).end();
        });
    });
  }
);

/*
Email to be sent to a mentor once they are no longer a trainee.
Requires an email and a name for the mentor.
*/
exports.sendTrainingCompletedEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email || !req.query.name) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Mentor Training Complete", // Subject line

      html: `
            <div>
                <div style="max-width: 600px; margin: auto">
                    <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                    <br><br><br>
                    <p  style="font-size: 16px">Greetings ${req.query.name}<br>
                    Congratulations on the completion of your Mentor Training. Now that your training is completed please be on the lookout for an email with your mentee match.  Thank you so much for being the best part of Y-KNOT Inc.<br>
                    <br>
                    Y-KNOT Inc
                    </p>  
                    <img style="width:200px; height:350px" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/TrainingCompleteCertificate.png?alt=media"/>
                <div>
            </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.sendInterviewEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email || !req.query.url) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Invitaton to Interview", // Subject line

      html: `
                <div>
                    <div style="max-width: 600px; margin: auto">
                        <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                        <br><br><br>
                        <p  style="font-size: 16px">Congrats!<br>
                        Based on your application, we would like to interview you for a mentor position at Y-KNOT Inc.<br>
                        <br>
                        The interview will last about 30 minutes. <br>
                        <b>Please select a date and time on the Calendly link:</b><br><a href="${req.query.url}">Calendly Interview Link</a> <br>
                        <br>
                        You will receive an email confirmation with your confirmed interview date and time and the Zoom link to the interview. <br>
                        <br>
                        With Kind Regards, <br>
                        Y-KNOT Inc.
                        </p>  
                    <div>
                </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.sendRejectionEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email || !req.query.name) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Mentor Application", // Subject line

      html: `
                <div>
                    <div style="max-width: 600px; margin: auto">
                        <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                        <br><br><br>
                        <p style="font-size: 16px">
                        Dear ${req.query.name},<br>
                        <br>
                        On behalf of Y-KNOT, I wanted to express my sincere thanks for your interest in our program. I understand that you have given a considerable amount of time to this process and we greatly appreciate  your effort. Unfortunately, we are unable to accept your application to be a mentor for our program.<br>
                        <br>
                        Thank you again for your time and interest in our program. <br>
                        <br>
                        <br>
                        Y-KNOT Inc
                        </p>
                    <div>
                </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.sendAcceptanceEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (
      !req.query.email ||
      !req.query.name ||
      !req.query.username ||
      !req.query.password
    ) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Mentor Application", // Subject line

      html: `
                <div>
                    <div style="max-width: 800px; margin: auto">
                        <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/top-banner.png?alt=media"/>
                        <br><br><br>
                        <p style="font-size: 16px">
                        Dear ${req.query.name},<br>
                        <br>
                        I personally want to welcome you to Y-KNOT Inc.  We are excited that you have found it in your heart to give back.  We don’t take it lightly that giving of your time is something that takes thought and dedication.  I trust that this letter finds you mutually excited about your new role as a Y-KNOT Inc. Mentor.<br>
                        <br>
                        I am hopeful that you have received the sign in email for your Y-KNOT Inc. email address where all business correspondence will filter through.  Your email address is ${req.query.username}, and once you log in the first time it will ask you to change your password.  If you have any issues, please feel free to contact me at your convenience.<br>
                        <br>
                        As a Y-KNOT Inc. mentor you are expected to spend ten hours a month with your mentee and maintain weekly contact in some form.  We are asking that you participate in activities that both parties will enjoy.  Weekly you will be required to track your time spent using the mentor portal<br>
                        <br>
                        Before you are matched with a mentee you are required to complete the mandatory mentor training located in our mentor portal.  The link for said training is www.yknotinc.org/for-mentor-only.  Your username and password are listed below.<br>
                        <br><br>
                        <span style="font-weight: 600; text-decoration: underline">Mentor Portal Information</span><br>
                        <br>
                        Username: ${req.query.username}<br>
                        <br>
                        Password: ${req.query.password}<br>
                        <br>
                        Link to mentor portal: <a href="${siteUrl}">${siteUrl}</a><br>
                        <br>
                        Please use the forget password link to reset your password for security purposes.  Once you have completed the trainings please send a copy of the certificate to mentors@yknotinc.org. <b>Please be reminded you will not be assigned a mentee until ALL training has been completed</b><br>
                        <br>
                        We look forward to working with you and moving forward throughout this mentoring cycle.  If you have any questions, comments, or concerns please feel free to contact me at your convenience.<br>
                        <br>
                        <br>
                        Y-KNOT Inc
                        </p>
                        <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/bottom-banner.png?alt=media"/>
                    <div>
                </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.sendPasswordUpdatedEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Y-KNOT Password Changed", // Subject line

      html: `
            <div>
                <div style="max-width: 600px; margin: auto">
                    <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                    <br><br><br>
                    <p style="font-size: 16px">
                    Hello,<br>
                    <br>
                    The password for your Y-KNOT Mentor Portal has recently been changed. If you did not request these changes you can reset your password here: <a href="#">reset password</a>
                    <br>
                    <br>
                    Otherwise, you can safely disregard this email.
                <div>
            </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("Password Changed Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});

exports.sendNewAccountCreatedEmail = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (!req.query.email || !req.query.password) {
      res.status(400).send("invalid request");
      return;
    }

    const msg = {
      from: '"Y-KNOT" <yknotincmentors@gmail.com>', // sender address
      to: req.query.email, // list of receivers
      subject: "Welcome to Y-KNOT", // Subject line

      html: `
            <div>
                <div style="max-width: 600px; margin: auto">
                    <img style="width:100%; height:auto" src="https://firebasestorage.googleapis.com/v0/b/yknot-ats.appspot.com/o/logo.png?alt=media"/>
                    <br><br><br>
                    <p style="font-size: 16px">
                    Hello,<br>
                    <br>
                    Your account has been created. Welcome to the Y-KNOT Mentor Portal, as an administrator you will be able to track and manage Y-KNOT Mentor applicants throughout all the stages of the application proccess. 
                    You can find your credentials listed below: <br>
                    <br>
                    <span style="font-weight: 600; text-decoration: underline">Mentor Portal Information</span><br>
                    <br>
                    Username: ${req.query.email}<br>
                    <br>
                    Password: ${req.query.password}<br>
                    <br>
                    Please make sure the use the forgot password link to reset your password for security purposes.
                    <br>
                    <br>
                    Welcome to the Y-KNOT Mentor Portal!
                <div>
            </div>
                
            `, // html body
    };

    transporter
      .sendMail(msg)
      .then(() => {
        console.log("message sent");
        res.status(200).send("New Account Created Email Sent");
      })
      .catch((error) => {
        console.log(error);
        res.send(400).end();
      });
  });
});
