import { DocumentData, DocumentSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import NetworkManager, { Endpoints } from "../network/NetworkManager";
import close from "../profile/assets/close.png";
import { Applicant, JotformResponse } from "../utils/utils";
import { Modal } from "../widgets/Modal";
import Content from "./Content/Content";
import "./TProfile.css";

export enum Tabs {
  TraineeProfile = "Your Profile",
}

const TProfile = () => {
  const navigate = useNavigate();
  const { traineeId } = useParams();
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const user = useAuth();
  const [data, setData] = useState<JotformResponse | null>(null);
  const [email, setEmail] = useState<string>("");
  const [applicantLogin, setApplicantLogin] = useState<[string, string]>([
    "",
    "",
  ]);

  const [tab, setTab] = useState<string>(Tabs.TraineeProfile);
  const [deleteModal, setDeleteModal] = useState<boolean>(false);

  useEffect(() => {
    getApplicant();
    getApplicantForm();
  }, []);

  const getApplicant = async () => {
    try {
      let snap = await NetworkManager.makeRequest(Endpoints.GetApplicant, {
        submissionId: traineeId,
      });
      snap = snap as DocumentSnapshot<DocumentData>;
      if (snap.exists()) {
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
        console.log(applicant);
        setEmail(data.email);
      } else {
        throw new Error("not-found");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const getApplicantForm = async () => {
    try {
      let data = await NetworkManager.makeRequest(Endpoints.GetApplicantForm, {
        id: traineeId,
      });
      setData(data as JotformResponse);
    } catch (error) {
      console.log(error);
    }
  };

  const deleteTrainee = async () => {
    try {
      await NetworkManager.makeRequest(Endpoints.DeleteMentor, {
        id: traineeId,
      });
      window.location.href = "/admin/home";
    } catch (error) {
      console.log(error);
    }
  };

  if (applicant) {
    return (
      <div className="t-profile">
        {deleteModal && (
          <Modal
            title="Delete Trainee"
            content={`Are you sure you wish to delete this trainee?`}
            onConfirm={() => deleteTrainee()}
            onCancel={() => {
              setDeleteModal(false);
            }}
          />
        )}
        <img className="exit-btn" src={close} onClick={() => navigate(-1)} />
        <div className="t-profile-container">
          <div className="t-profile-header">
            <div className="t-profile-header-left">
              <h1 className="name">
                {applicant.firstName} {applicant.lastName}
              </h1>
            </div>
          </div>
          <div className="t-profile-tabs-container">
            <div className="t-profile-tabs">
              {Object.values(Tabs).map((curr) => {
                return (
                  <h1
                    key={curr}
                    className={
                      curr === tab ? "tab-title selected" : "tab-title"
                    }
                    onClick={(e) => setTab(e.currentTarget.innerHTML)}
                  >
                    {curr}
                  </h1>
                );
              })}
            </div>
            <button
              className="t-profile-delete-button"
              onClick={() => setDeleteModal(true)}
            >
              Delete Trainee
            </button>
          </div>

          <Content type={tab} data={data} applicant={applicant} />
        </div>
      </div>
    );
  } else {
    return <div></div>;
  }
};

export default TProfile;
