import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import CourseCard from '../components/CourseCard';
import { levels, sampleCourses } from '../data/preview';

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const handleSearch = (event) => { event.preventDefault(); navigate(`/catalog${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`); };
  return (
    <main className="home-page">
      <div className="page-eyebrow"><span className="eyebrow-line"/> THE HOME OF YOUR COURSE MATERIALS</div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-dot"/> A SMARTER WAY TO STUDY</div>
          <h1>Your courses.<br/>Your resources.<br/><em>All in one place.</em></h1>
          <p>Spend less time hunting through chats. Find course materials, past questions and model answers in one organized space.</p>
          <form className="hero-search" onSubmit={handleSearch} role="search"><Icon name="search" size={21}/><label className="sr-only" htmlFor="home-search">Search courses</label><input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a course, code or topic…"/><button type="submit" aria-label="Search courses"><Icon name="arrowRight" size={21}/></button></form>
          <div className="hero-caption"><Icon name="shield" size={15}/> Exclusively for EBSU Computer Science</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit art-orbit-one"/><div className="art-orbit art-orbit-two"/>
          <div className="art-sheet art-sheet-back"><div className="sheet-overline">COURSE LIBRARY</div><div className="sheet-bars"><i/><i/><i/></div><div className="sheet-tag">CSC / INDEX</div></div>
          <div className="art-sheet art-sheet-front"><div className="art-sheet-top"><span className="sheet-emblem"><Icon name="layers" size={22}/></span><span>STUDY FILE / 01</span></div><div className="art-sheet-title">Everything<br/>is in order<span>.</span></div><div className="art-sheet-lines"><i/><i/><i/></div><div className="art-sheet-footer"><span>RESOURCES, SORTED.</span><Icon name="arrowUpRight" size={20}/></div></div>
          <div className="art-floating"><Icon name="checkCircle" size={19}/><span>Less searching.<br/><strong>More learning.</strong></span></div>
          <span className="art-plus art-plus-one">+</span><span className="art-plus art-plus-two">+</span>
        </div>
      </section>

      <section className="home-levels section-block"><div className="section-heading"><div><div className="section-kicker">FIND YOUR LEVEL</div><h2>Jump right in.</h2><p>Start with your level. We'll help you get to the right course.</p></div><Link className="text-link" to="/catalog">Browse all courses <Icon name="arrowUpRight" size={17}/></Link></div><div className="level-grid">{levels.map((level, index) => <Link className="level-tile" key={level} to={`/catalog?level=${level}`}><div className="level-index">0{index + 1} <span>/ 05</span></div><span className="level-number">{level}<small>L</small></span><span className="level-label">LEVEL {level} <Icon name="arrowUpRight" size={18}/></span></Link>)}</div></section>

      <section className="home-courses section-block"><div className="section-heading"><div><div className="section-kicker">EXPLORE THE INDEX</div><h2>One library. Every kind of resource.</h2><p>A preview of the course pages being prepared for CourseHub.</p></div><Link className="text-link" to="/catalog">Open the catalog <Icon name="arrowUpRight" size={17}/></Link></div><div className="preview-note"><Icon name="info" size={17}/> These course cards are interface examples, not published records or available downloads.</div><div className="course-grid">{sampleCourses.slice(0, 3).map((course) => <CourseCard key={course.id} course={course}/>)}</div></section>

      <section className="home-bottom"><div className="home-bottom-left"><div className="section-kicker">BUILD YOUR STUDY SPACE</div><h2>All the material.<br/><span>None of the mess.</span></h2><p>Keep your learning resources together, find answers when you need them, and spend more time on what matters.</p><Link to="/register" className="btn btn-light">Create your free account <Icon name="arrowUpRight" size={18}/></Link></div><div className="home-bottom-right"><div className="feature-line"><span><Icon name="search"/></span><div><strong>Find it faster</strong><p>Search by course, level or resource type.</p></div></div><div className="feature-line"><span><Icon name="layers"/></span><div><strong>Stay organized</strong><p>Everything arranged around your coursework.</p></div></div><div className="feature-line"><span><Icon name="graduation"/></span><div><strong>Learn with confidence</strong><p>One shared resource space for the department.</p></div></div></div></section>
    </main>
  );
}
