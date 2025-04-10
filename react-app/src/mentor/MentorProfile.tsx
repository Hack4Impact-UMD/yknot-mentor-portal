import {
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import NetworkManager, { Endpoints } from "../network/NetworkManager";
import close from "../profile/assets/close.png";
import { Applicant, JotformResponse, MenteeFormNotes } from "../utils/utils";

import LogsReports from "./Tabs/LogsReports/LogsReports";
import Mentee from "./Tabs/Mentee/Mentee";
import MentorInfo from "./Tabs/MentorInfo/MentorInfo";

import Loading from "../widgets/Loading";
import { Modal } from "../widgets/Modal";
import "./MentorProfile.css";

export enum Tabs {
  MentorInfo = "Your Profile",
  MenteeProfile = "Mentee Profile",
  LogsAndReports = "Logs and Reports",
}

type Props = {
  defaultTab: string;
};
export type ExtendedMenteeForm = MenteeFormNotes & {
  mentorId: string | undefined;
  menteeId: string;
};
const MentorProfile: React.FC<Props> = ({ defaultTab }) => {
  const navigate = useNavigate();
  const { mentorId } = useParams();
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [formData, setFormData] = useState<JotformResponse | null>(null);
  const [menteeList, setMenteeList] = useState<ExtendedMenteeForm[]>([]);
  const [deleteModal, setDeleteModal] = useState<boolean>(false);

  const [tab, setTab] = useState<string>(defaultTab);

  useEffect(() => {
    getApplicant();
    getApplicantForm();
    getMentees();
  }, []);

  const getMentees: VoidFunction = async () => {
    try {
      let snap = await NetworkManager.makeRequest(Endpoints.GetApplicant, {
        submissionId: mentorId,
      });
      snap = snap as QuerySnapshot<DocumentData>;
      console.log(snap.data());
      const menteeIds = snap.data()?.mentee_ids;
      console.log(menteeIds);
      const menteeData = [];
      for (let id of menteeIds) {
        let data = await NetworkManager.makeRequest(Endpoints.GetMenteeForm, {
          id: id,
        });
        data = data.content.answers;
        let snap = await NetworkManager.makeRequest(Endpoints.GetMentee, {
          submissionId: id,
        });
        snap = snap as DocumentSnapshot<DocumentData>;
        if (!snap.exists()) {
          throw new Error("not-found");
        }
        let mentee: ExtendedMenteeForm;
        mentee = {
          parentName:
            data["100"]?.answer?.first + " " + data["100"]?.answer?.last,
          childName:
            data["103"]?.answer?.first + " " + data["103"]?.answer?.last,
          streetAddress: data["3"]?.answer,
          city: data["4"]?.answer,
          state: data["5"]?.answer,
          zip: data["6"]?.answer,
          phoneNumber: data["7"]?.answer?.full,
          age: data["9"]?.answer,
          gender: data["11"]?.answer,
          school: data["101"]?.answer,
          requestedBy: data["102"]?.answer,
          whyBenefit: data["109"]?.answer,
          subjects: data["110"]?.answer,
          otherComments: data["111"]?.answer,
          areas: data["105"]?.answer,
          interests: data["106"]?.answer,
          bestDescribes: data["107"]?.answer,
          email: data["112"]?.answer,
          grade: data["113"]?.answer,
          oldMentorsList: snap.data()?.priorMentors,
          menteeId: id,
          mentorId,
        };
        menteeData.push(mentee);
      }
      setMenteeList(menteeData);
    } catch (error) {
      console.error(error);
    }
  };

  const getApplicant = async () => {
    try {
      let snap = await NetworkManager.makeRequest(Endpoints.GetApplicant, {
        submissionId: mentorId,
      });
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
    } catch (error) {
      console.log(error);
    }
  };

  const getApplicantForm = async () => {
    try {
      let data = await NetworkManager.makeRequest(Endpoints.GetApplicantForm, {
        id: mentorId,
      });
      setFormData(data as JotformResponse);
    } catch (error) {
      console.log(error);
    }
  };

  /* RENDER FUNCTIONS */
  const renderTabs = (tab: string) => {
    const tabs = Object.values(Tabs).map((curr) => (
      <h1
        key={curr}
        className={curr === tab ? "tab-title selected" : "tab-title"}
        onClick={(e) => setTab(e.currentTarget.innerHTML)}
      >
        {curr}
      </h1>
    ));
    return tabs;
  };

  const getTabContents = (
    tab: string,
    formData: JotformResponse | null,
    menteeList: ExtendedMenteeForm[]
  ) => {
    switch (tab) {
      case Tabs.MentorInfo:
        if (!applicant || !formData) return <Loading />;
        else return formData && <MentorInfo data={formData} />;
      case Tabs.MenteeProfile:
        if (!menteeList) return <Loading />;
        else return <Mentee mentees={menteeList} />;
      case Tabs.LogsAndReports:
        return <LogsReports />;
      default:
        return null;
    }
  };
  const deleteMentor = async () => {
    try {
      await NetworkManager.makeRequest(Endpoints.DeleteMentor, {
        id: mentorId,
      });
      window.location.href = "/admin/home";
    } catch (error) {
      console.log(error);
    }
  };

  if (!applicant || !menteeList || !formData) {
    return <Loading />;
  }
  return (
    <div className="mentor-profile">
      {deleteModal && (
        <Modal
          title="Delete Mentor"
          content={`Are you sure you wish to delete this mentor?`}
          onConfirm={() => deleteMentor()}
          onCancel={() => {
            setDeleteModal(false);
          }}
        />
      )}

      {/* Close button */}
      <img className="exit-btn" src={close} onClick={() => navigate(-1)} />

      <div className="mentor-profile-container">
        {/* Mentor Name */}
        <h1 className="mentor-name">
          {applicant.firstName} {applicant.lastName}
        </h1>
        {/* Tabs */}
        <div className="mentor-profile-tabs-container">
          <div className="mentor-profile-tabs">{renderTabs(tab)}</div>
          <button
            className="mentor-profile-delete-button"
            onClick={() => setDeleteModal(true)}
          >
            Delete Mentor
          </button>
        </div>
        {/* Tab Content */}
        <section className="tab-content-wrapper">
          {getTabContents(tab, formData, menteeList)}
        </section>
      </div>
    </div>
  );
};

export default MentorProfile;
