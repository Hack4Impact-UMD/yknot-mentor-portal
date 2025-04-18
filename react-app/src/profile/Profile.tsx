import React, { useState, useEffect } from "react";
import { DocumentData, DocumentSnapshot } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";

import "./Profile.css";
import Content from "./Content/Content";
import NetworkManager, { Endpoints } from "../network/NetworkManager";
import { Applicant, ApplicantStages, JotformResponse } from "../utils/utils";
import ApplicantStageTile from "../applicants-old/ApplicantStageTile/ApplicantStageTile";
import accept from "./assets/check-circle.png";
import reject from "./assets/x-circle.png";
import close from "./assets/close.png";
import next from "./assets/next.png";
import AdvancementModal from "./Modal/AdvancementModal";
import Popup from "../settings/Popup/Popup";
import Toast from "../widgets/Toast";

export enum Tabs {
  UserInformation = "User Information",
  Application = "Application",
  Interview = "Interview",
  BackgroundCheck = "Background Check",
}

export enum Actions {
  MoveToInterviewStage,
  MoveToBackgroundCheckStage,
  Accept,
  Reject,
}

const Profile = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [data, setData] = useState<JotformResponse | null>(null);
  const [showAdvancementModal, setShowAdvancementModal] = useState<boolean>(false);
  const [action, setAction] = useState<Actions>(Actions.MoveToInterviewStage);
  const [popupMessage, setPopupMessage] = useState<[boolean, string]>([false, ""]);
  const [email, setEmail] = useState<string>("");
  const [applicantLogin, setApplicantLogin] = useState<[string, string]>(["", ""]);
  const [interviewTime, setInterviewTime] = useState<Date | null>(null);

  const [tab, setTab] = useState<Tabs>(Tabs.UserInformation);

  useEffect(() => {
    getApplicant();
    getApplicantForm();
  }, []);

  const getInterviewTime = async (email: string) => {
    try {
      let d = (await NetworkManager.makeRequest(
        Endpoints.GetScheduledInterview,
        { email: email }
      )) as Date;
      setInterviewTime(d);
    } catch (error) {
      console.log(`No interview scheduled for ${email}`);
      console.log(error);
    }
  };

  const getApplicant = async () => {
    try {
      let snap = await NetworkManager.makeRequest(Endpoints.GetApplicant, { submissionId: id, });
      snap = snap as DocumentSnapshot<DocumentData>;
      if (!snap.exists()) {
        throw new Error("not-found");
      }
      const data = snap.data();
      setApplicant({
        type: "Applicant",
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phoneNumber: data.phone_number,
        stage: data.stage,
        submissionId: data.submission_id,
        notes: data.note || "",
        createdAt: data.createdAt,
      });
      setEmail(data.email);

      if (data.stage != ApplicantStages.New) {
        getInterviewTime(data.email);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const getApplicantForm = async () => {
    try {
      let data = await NetworkManager.makeRequest(Endpoints.GetApplicantForm, {
        id: id,
      });
      setData(data as JotformResponse);
    } catch (error) {
      console.log(error);
    }
  };

  const handleClick = () => {
    if (action === Actions.MoveToInterviewStage || action === Actions.MoveToBackgroundCheckStage) {
      moveToNextStage();
    } else if (action === Actions.Accept) {
      acceptApplicant();
    } else if (action === Actions.Reject) {
      rejectApplicant();
    }
  };

  const moveToNextStage = async () => {
    let stage = applicant?.stage;
    let nextStage: ApplicantStages;
    if (stage === ApplicantStages.New) {
      nextStage = ApplicantStages.Interviewing;

      try {
        // create calendly email
        let url = (await NetworkManager.makeRequest(
          Endpoints.GetCalendlyLink
        )) as string;
        url = url.concat(
          `?name=${applicant?.firstName}%20${applicant?.lastName}&email=${email}`
        );
        console.log(`calendly url: ${url}`);
        // send email w/ interview
        await NetworkManager.makeRequest(Endpoints.SendInterviewEmail, { email: email, url: url });
        console.log("sent email");

        // move user in database
        await NetworkManager.makeRequest(Endpoints.UpdateStage, { id: applicant?.submissionId, stage: nextStage });
        console.log("updated db");
        setShowAdvancementModal(false);
        window.location.reload();
      } catch (error) {
        if (error === "invalid-email") {
          setPopupMessage([true, "Email Adddress in Invalid."]);
        } else {
          setPopupMessage([
            true,
            "Oops, something went wrong. Please try again later.",
          ]);
        }
        console.log(error);
        setShowAdvancementModal(false);
      }
    } else {
      nextStage = ApplicantStages.BackgroundCheck;

      try {
        // send email requesting background check
        await NetworkManager.makeRequest(Endpoints.SendBackgroundCheckEmail, {
          email: email,
        });
        console.log("sent email");

        await NetworkManager.makeRequest(Endpoints.UpdateStage, {
          id: applicant?.submissionId,
          stage: nextStage,
        });
        console.log("updated db");
        setShowAdvancementModal(false);
        window.location.reload();
      } catch (error) {
        if (error === "invalid-email") {
          setPopupMessage([true, "Email Adddress in Invalid."]);
        } else {
          setPopupMessage([
            true,
            "Oops, something went wrong. Please try again later.",
          ]);
        }
        console.log(error);
        setShowAdvancementModal(false);
      }
    }
  };

  const acceptApplicant = async () => {
    try {
      // create trainee account
      const fid = await NetworkManager.makeRequest(Endpoints.CreateNewUser, {
        email: applicantLogin[0],
        password: applicantLogin[1],
        role: "trainee",
      });
      console.log("created account");

      // update firebase id
      await NetworkManager.makeRequest(Endpoints.UpdateFirebaseId, {
        id: applicant?.submissionId,
        firebaseId: fid,
      });
      console.log("updated firebase id");

      // send email to accept applicant
      await NetworkManager.makeRequest(Endpoints.SendAcceptanceEmail, {
        email: email,
        name: applicant?.firstName + " " + applicant?.lastName,
        username: applicantLogin[0],
        password: applicantLogin[1],
      });
      console.log("sent email");

      // move applicant in database
      await NetworkManager.makeRequest(Endpoints.SetRole, {
        id: applicant?.submissionId,
        firebaseId: fid,
        role: "trainee",
      });
      console.log("updated stage");

      setShowAdvancementModal(false);
      navigate('/admin/home');
      
    } catch (error) {
      if (error === "invalid-email") {
        setPopupMessage([true, "Email Adddress in Invalid."]);
      } else {
        setPopupMessage([
          true,
          "Oops, something went wrong. Please try again later.",
        ]);
      }
      console.log(error);
      setShowAdvancementModal(false);
    }
  };

  const rejectApplicant = async () => {
    try {
      // send email to reject applicant
      await NetworkManager.makeRequest(Endpoints.SendRejectionEmail, {
        email: email,
        name: applicant?.firstName + " " + applicant?.lastName,
      });
      console.log("sent email");

      // move applicant in database
      await NetworkManager.makeRequest(Endpoints.UpdateStage, {
        id: applicant?.submissionId,
        stage: ApplicantStages.Rejected,
      });
      console.log("sent email");

      setShowAdvancementModal(false);
      window.location.reload();
    } catch (error) {
      if (error === "invalid-email") {
        setPopupMessage([true, "Email Adddress in Invalid."]);
      } else {
        setPopupMessage([
          true,
          "Oops, something went wrong. Please try again later.",
        ]);
      }
      console.log(error);
      setShowAdvancementModal(false);
    }
  };

  if (!applicant) {
    return null;
  }
  
  // RENDER FUNCTIONS
  const renderAdvancementModal = () => {
    if (!showAdvancementModal) {
      return null;
    }

    return (
      <AdvancementModal
        firstname={applicant.firstName}
        lastname={applicant.lastName}
        action={action}
        email={applicant.email}
        setEmail={setEmail}
        setApplicantLogin={setApplicantLogin}
        accept={handleClick}
        reject={() => setShowAdvancementModal(false)}
      />
    );
  }

  const renderPopup = () => {
    if (popupMessage[1].length === 0) {
      return null;
    }

    return (
      <Toast
        isError={popupMessage![0]}
        message={popupMessage![1]}
        timeout={4000}
        onDelete={() => setPopupMessage([false, ""])}
      />
    );
  }

  const getAdvancementButton = () => {
    if (applicant.stage === ApplicantStages.BackgroundCheck) {
      //This is the last stage, so we want to render the accept button
      return (
        <button
          className="button accept"
          onClick={() => {
            setShowAdvancementModal(true);
            setAction(Actions.Accept);
          }}
        >
          Accept <img src={accept} />
        </button>
      );
    } else {
      //Otherwise, we render the next stage button
      return (
        <button
          className="button accept"
          onClick={() => {
            setShowAdvancementModal(true);
            if (applicant.stage === ApplicantStages.New) {
              setAction(Actions.MoveToInterviewStage);
            } else if (applicant.stage === ApplicantStages.Interviewing) {
              setAction(Actions.MoveToBackgroundCheckStage);
            }
          }}
        >
            Next Stage <img src={next} />
        </button>
      );
    }
  }

  const renderAdvancementAndRejectionButtons = () => {
    if (applicant.stage === ApplicantStages.Accepted || applicant.stage === ApplicantStages.Rejected) {
      return null;
    }
    return (
      <div className="profile-header-right">
        {/* Advancement */}
        {getAdvancementButton()}
        {/* Rejection */}
        <button
          className="button reject"
          onClick={() => {
            setShowAdvancementModal(true);
            setAction(Actions.Reject);
          }}
        >
            Reject <img src={reject} />
        </button>
      </div>
    );
  }

  return (
    <div className="applicant-profile">
      {/* Modal for moving the applicant to the next stage or accepting them. */}
      {renderAdvancementModal()}
      {/* Popup */}
      {renderPopup()}
      {/* Close Button */}
      <img className="exit-btn" src={close} onClick={() => navigate(-1)} />
      <div className="profile-header">
        <div className="profile-header-left">
          {/* Applicant Name */}
          <h1 className="name">
            {applicant.firstName} {applicant.lastName}
          </h1>
          {/* Stage */}
          <ApplicantStageTile stage={applicant.stage} maximized />
        </div>
        {/* Accept Reject */}
        {renderAdvancementAndRejectionButtons()}
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {Object.values(Tabs).map((curr, idx) => (
          <h1
            key={idx}
            className={curr === tab ? "tab-title selected" : "tab-title"}
            onClick={() => setTab(curr)}
          >
            {curr}
          </h1>))}
      </div>
      {/* Content */}
      <div className="content-box">
        <div className="content-scroll">
          <Content
            type={tab}
            data={data}
            applicant={applicant}
            interviewTime={interviewTime}
          />
        </div>
      </div>
    </div>
  );
};

export default Profile;
