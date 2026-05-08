import "./dayNightLoader.css";

const DayNightLoader = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="loader"></div>
      <p className="mt-4 text-sm text-gray-500">
        Syncing your workflow...
      </p>
    </div>
  );
};

export default DayNightLoader;