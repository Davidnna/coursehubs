import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { sampleCourses } from '../data/preview';
import NotFound from './NotFound';

const tabs = [{ label: 'Course materials', icon: 'book' }, { label: 'Past questions', icon: 'fileQuestion' }, { label: 'Model answers', icon: 'checkCircle' }];

export default function CourseDetail() {
  const { id } = useParams();
  const course = sampleCourses.find((item) => item.id === id);
  const [activeTab, setActiveTab] = useState(0);
  if (!course) return <NotFound/>;
  return <main className="standard-page detail-page"><div className="breadcrumb"><Link to="/">Home</Link><Icon name="chevronRight" size={14}/><Link to="/catalog">Course index</Link><Icon name="chevronRight" size={14}/>{course.code}</div>
    <div className="detail-hero"><div><span className="detail-type">SAMPLE COURSE / {course.level} LEVEL</span><h1>{course.title}</h1><p>{course.description}</p><div className="detail-meta"><span><Icon name="book" size={17}/> {course.code}</span><span><Icon name="graduation" size={17}/> {course.level} level</span><span><Icon name="clock" size={17}/> {course.semester} semester</span></div></div><div className="detail-symbol"><Icon name="layers" size={66} strokeWidth={1.2}/></div></div>
    <div className="detail-grid"><div className="detail-main"><div className="detail-tabs" role="tablist" aria-label="Resource category">{tabs.map((tab, index) => <button key={tab.label} role="tab" aria-selected={activeTab === index} className={`detail-tab ${activeTab === index ? 'detail-tab-active' : ''}`} onClick={() => setActiveTab(index)}><Icon name={tab.icon} size={18}/><span>{tab.label}</span></button>)}</div><div className="resource-empty"><div className="resource-empty-icon"><Icon name={tabs[activeTab].icon} size={28}/></div><h2>No live {tabs[activeTab].label.toLowerCase()} yet</h2><p>The document API and file storage are not connected. This page demonstrates how resources will be organized once they are available.</p><Link to="/catalog" className="btn btn-primary">Back to the index <Icon name="arrowRight" size={18}/></Link></div></div><aside className="detail-aside"><div className="aside-card"><span className="section-kicker">ABOUT THIS PREVIEW</span><h3>One course.<br/>One clear view.</h3><p>Each live course page will group course materials, past questions and linked model answers for easy discovery.</p><div className="aside-card-divider"/><div className="aside-info"><Icon name="shield" size={18}/> Account required to download</div><div className="aside-info"><Icon name="search" size={18}/> Browsing stays open to everyone</div></div><Link className="aside-join" to="/register"><Icon name="user" size={21}/><span><strong>New to CourseHubs?</strong><small>Create a free account</small></span><Icon name="arrowUpRight" size={18}/></Link></aside></div>
  </main>;
}
